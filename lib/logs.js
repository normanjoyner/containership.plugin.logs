var _ = require("lodash");
var async = require("async");
var request = require("request");

module.exports = function(core){

    return {

        register_route: function(){
            core.api.server.server.get("/:api_version/logs/:application/containers/:container/:log_type", this.route_callback);
        },

        route_callback: function(req, res, next){
            async.waterfall([
                function(fn){
                    var valid_log_types = ["stderr", "stdout"];
                    if(!_.contains(valid_log_types, req.params.log_type)){
                        var err = new Error({ status: 400 });
                        return fn(err);
                    }

                    return fn();
                },
                function(fn){
                    self.get_container(req.params.application, req.params.container, function(err, container){
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
                    self.get_containers("containership-logs", function(err, containers){
                        if(err)
                            var err = new Error({ status: 404 });
                            return fn(err);

                        containers = _.indexBy(containers, "host");
                        var container = containers[peer.id];

                        var options = {
                            address: peer.address[core.options["legiond-scope"]],
                            port: container.host_port
                        }

                        return fn(null, options);
                    });
                }
            ], function(err){
                if(err)
                    res.sendStatus(err.status);
                else{
                    var options = {
                        baseUrl: [options.address, options.port].join(":"),
                        url: ["", "logs", ["name", [req.params.application, req.params.container].join(":")].join("-")].join("/"),
                        json: true
                    }

                    request(options).pipe(res);
                }
            });
        }

    }
}
