const fs = require('fs');
const _ = require('lodash');
const request = require('request');
const http = require('http');
const { ContainershipPlugin, ApiBuilder } = require('@containership/containership.plugin');

const PING_INTERVAL = 5000;
const PORT = 3000;

class ContainershipLogsPlugin extends ContainershipPlugin {

    constructor() {
        super({
            name: 'logs',
            description: 'A plugin to store and serve the logs of applications running on Containership.',
            types: ['core']
        });
    };

    startLeader(host) {
        const api = host.getApi();

        const logPath = '/var/log/containership';
        const applicationName = 'containership-logs';

        api.createApplication({
            id: applicationName,
            image: 'containership/docker-cs-logs:latest',
            cpus: 0.1,
            memory: 64,
            container_port: PORT,
            tags: {
                constraints: {
                    per_host: '1'
                },
                metadata: {
                    plugin: applicationName,
                    ancestry: 'containership.plugin.v2'
                },
            },
            env_vars: {
                CSHIP_LOG_PATH: logPath,
            },
            volumes: [
                {
                    host: logPath,
                    container: logPath
                }
            ]
        }, (err, result) => {
            if(err) {
                console.error(err.messsage);
            }
        });

    }

    getApiRoutes(host) {
        const api = host.getApi();

        return new ApiBuilder()
            .get('/applications/:application/containers/:container', (req, res) => {
                api.getHosts((hosts) => {
                    // fetch target host running container
                    const targetHost = _.flow(
                        _.partial(_.values, _),
                        _.partial(_.filter, _, (host) => {
                            return _.some(host.containers, (c) => {
                                return (c.name || c.application) === req.params.application &&
                                    (c.container_id || c.id) === req.params.container;
                            });
                        }),
                        _.partial(_.first, _))(hosts);

                    if(targetHost) {
                        const targetContainer = _.find(targetHost.containers, (c) => {
                            return (c.name || c.application) === req.params.application;
                        });

                        const hostIP = _.get(targetHost, ['address', 'private']);
                        const port = _.get(targetContainer, 'host_port', PORT);

                        res.header('Content-Type', 'text/event-stream');
                        res.header('Cache-Control', 'no-cache');
                        res.header('Connection', 'keep-alive');
                        res.header('X-Accel-Buffering', 'no');
                        res.status(200);

                        const sendPing = () => {
                            res.write('event: ping\n');
                            res.write('data: Containership Cloud Logs keep-alive ping\n\n');
                        };

                        sendPing();

                        const ping = setInterval(sendPing, PING_INTERVAL);

                        const options = {
                            headers: {
                                Accept: 'application/json'
                            },
                            host: hostIP,
                            port: port,
                            path: `/logs/applications/${req.params.application}/containers/${req.params.container}?type=${req.query.type || 'stdout'}`
                        };

                        const request = http.request(options, (hostRes) => {
                            hostRes.on('data', (chunk) => {
                                const split = chunk.toString('utf8').split(/\r?\n/);

                                for (let x = 0, size = split.length; x < size; x++) {
                                    if(x === size - 1) {
                                        res.write(`data: ${split[x]}\n\n`);
                                    } else {
                                        res.write(`data: ${split[x]}\n`);
                                    }
                                }
                            });

                            function cleanup() {
                                clearInterval(ping);
                                res.end();
                                request.destroy();
                            }

                            hostRes.on('end', cleanup);
                            hostRes.on('error', cleanup);
                        });

                        // trigger request to fire
                        request.end();

                        return req.on('close', () => {
                            request.destroy();
                        });

                    // could not find host running specified container
                    } else {
                        res.status(404);
                    }

                });
    }

}

module.exports = ContainershipLogsPlugin;
