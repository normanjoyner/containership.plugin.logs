'use strict';

const _ = require('lodash');
const async = require('async');
const http = require('http');

module.exports.Init = function(core) {
    return {
        register_route: function() {
            core.api.server.server.get('/:api_version/logs/applications/:application/containers/:container', this.route_callback);
        },

        route_callback: function(req, res, next) {
            async.waterfall([
                (fn) => {
                    return core.applications.get_container(req.params.application, req.params.container, (err, container) => {
                        if(err) {
                            return fn({ status: 404 });
                        }

                        return fn(null, container);
                    });
                },
                (container, fn) => {
                    const peers = _.indexBy(core.cluster.legiond.get_peers(), 'id');
                    const peer = peers[container.host];

                    if(_.isUndefined(peer)) {
                        return fn({ status: 404 });
                    }

                    return fn(null, peer);
                },
                (peer, fn) => {
                    return core.applications.get_containers('containership-logs', (err, containers) => {
                        if(err){
                            return fn({ status: 404 });
                        }

                        containers = _.indexBy(containers, 'host');
                        const logContainer = containers[peer.id];

                        const options = {
                            host: peer.address[core.options['legiond-scope']],
                            port: logContainer.host_port
                        };

                        return fn(null, options);
                    });
                }
            ], (err, options) => {
                if(err) {
                    return res.sendStatus(err.status);
                }

                res.setHeader('Connection', 'Transfer-Encoding');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Transfer-Encoding', 'chunked');

                options.path = `/logs/applications/${req.params.application}/containers/${req.params.container}?type=${req.query.type || 'stdout'}`;

                options.headers = {
                    Accept: 'application/json'
                }

                const request = http.request(options, (response) => {
                    response.on('data', (chunk) => {
                        res.write(chunk);
                    });

                    return response.on('end', () => {
                        res.end();
                        request.destroy();
                    })
                });

                // trigger request to fire
                request.end();

                return req.on('close', () => {
                    request.destroy();
                });
            });
        }
    }
}
