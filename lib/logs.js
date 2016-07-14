'use strict';

const _ = require('lodash');
const async = require('async');
const http = require('http');

module.exports.Init = function(core) {
    return {
        register_routes: function() {
            core.api.server.server.get('/:api_version/logs/applications/:application/containers/:container', this.container_logs);
            core.api.server.server.get('/:api_version/logs/hosts/:host', this.host_logs);
        },

        host_logs: function(req, res, next) {
            // retrieve all containers the containership-logs application is running on
            return core.applications.get_containers('containership-logs', (err, containers) => {
                if(err) {
                    return res.sendStatus(404);
                }

                containers = _.indexBy(containers, 'host');
                const logContainer = containers[req.params.host];

                // if containership-logs is not running on requested host, return 404
                if (!logContainer) {
                    return res.sendStatus(404);
                }

                const cs_proc_opts = JSON.parse(logContainer.env_vars.CS_PROC_OPTS);
                const options = {
                    host: cs_proc_opts.legiond.network.address[core.options['legiond-scope']],
                    port: logContainer.host_port
                };

                // attach streaming response headers
                res.setHeader('Connection', 'Transfer-Encoding');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Transfer-Encoding', 'chunked');

                options.path = `/logs/hosts/${req.params.host}`;

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
        },

        container_logs: function(req, res, next) {
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

                // attach streaming response headers
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
