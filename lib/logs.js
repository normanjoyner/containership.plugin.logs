var _ = require("lodash");
var async = require("async");
var http = require("http");

module.exports = function(core){

    return {

        register_route: function(){
            core.api.server.server.get("/:api_version/logs/:application/containers/:container", this.route_callback);
        },

        route_callback: function(req, res, next){
            async.waterfall([
                function(fn){
                    core.applications.get_container(req.params.application, req.params.container, function(err, container){
                        if(err){
                            var err = new Error({ status: 404 });
                            return fn(err);
                        }

                        return fn(null, container);
                    });
                },
                function(container, fn){
                    var peers = _.indexBy(core.cluster.legiond.get_peers(), "id");
                    var peer = peers[container.host];
                    if(_.isUndefined(peer)){
                        var err = new Error({ status: 404 });
                        return fn(err);
                    }

                    return fn(null, peer);
                },
                function(peer, fn){
                    core.applications.get_containers("containership-logs", function(err, containers){
                        if(err){
                            var err = new Error({ status: 404 });
                            return fn(err);
                        }

                        containers = _.indexBy(containers, "host");
                        var container = containers[peer.id];

                        var options = {
                            address: peer.address[core.options["legiond-scope"]],
                            port: container.host_port
                        }

                        return fn(null, options);
                    });
                }
            ], function(err, options){
                if(err)
                    res.sendStatus(err.status);
                else{
                    res.setHeader("Connection", "Transfer-Encoding");
                    res.setHeader("Content-Type", "text/html; charset=utf-8");
                    res.setHeader("Transfer-Encoding", "chunked");

                    options.path = ["", "logs", ["name", [req.params.application, req.params.container].join("-")].join(":")].join("/");

                    options.headers = {
                        Accept: "application/json"
                    }

                    var request = http.request(options, function(response){
                        response.on("data", function(chunk){
                            res.write(chunk);
                        });
                        response.on("error", function(err){
                            res.end();
                            request.destroy();
                        });
                    });

                    request.end();

                    req.on("close", function(){
                        request.destroy();
                    });
                }
            });
        }

    }
}
