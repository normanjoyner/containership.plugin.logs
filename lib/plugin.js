const fs = require('fs');
const _ = require('lodash');
const request = require('request');
const http = require('http');
const { ContainershipPlugin, ApiBuilder } = require('@containership/containership.plugin');

class ContainershipLogsPlugin extends ContainershipPlugin {

    constructor() {
        super({
            name: 'logs',
            description: 'A plugin to store and serve the logs of applications running on ContainerShip.',
            types: ['core']
        });
    };

    startLeader(host) {
        const api = host.getApi();

        console.log("STARTING LEADER - CREATING logs application.");

        const logPath = '/var/log/containership';
        const applicationName = 'containership-logs';

        api.createApplication({
            id: applicationName,
            image: 'containership/docker-cs-logs:latest',
            cpus: 0.1,
            memory: 64,
            container_port: 3000,
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
            console.log("In logs plugin: " + err + "  " + result);
        });

    }

    getApiRoutes(host) {
        const api = host.getApi();

        return new ApiBuilder()
            .get("/applications/:application/containers/:container", (req, res) => {

                console.log("Getting container logs for: " + JSON.stringify(req.params));

                api.getHosts((hosts) => {

                    console.log("Have Hosts: " + JSON.stringify(hosts));

                    const targetHost = _.flow(
                        _.partial(_.values, _),
                        _.partial(_.filter, _, (host) => {
                            return _.some(host.containers, (c) => {
                                console.log("Checking c: " + JSON.stringify(c));
                                return (c.name || c.application) === req.params.application &&
                                    (c.container_id || c.id) === req.params.container;
                            });
                        }),
                        _.partial(_.first, _))(hosts);

                    if(targetHost) {

                        const targetContainer = _.find(targetHost.containers, (c) => {
                            return (c.name || c.application) === req.params.application;
                        });

                        console.log("Target container: " + JSON.stringify(targetContainer));

                        const hostIP = _.get(targetHost, ["address", "private"]);
                        const port = _.get(targetContainer, "host_port", 3000);

                        res.header('Content-Type', 'text/event-stream');
                        res.header('Cache-Control', 'no-cache');
                        res.header('Connection', 'keep-alive');
                        res.header('X-Accel-Buffering', 'no');
                        res.status(200);

                        const sendPing = () => {
                            res.write('event: ping\n');
                            res.write('data: ContainerShip Cloud Logs keep-alive ping\n\n');
                        };

                        sendPing();

                        const ping = setInterval(sendPing, 5000);

                        const options = {
                            headers: {
                                Accept: 'application/json'
                            },
                            host: hostIP,
                            port: port,
                            path: `/logs/applications/${req.params.application}/containers/${req.params.container}?type=${req.query.type || 'stdout'}`
                        };

                        console.log("Hitting options: " + JSON.stringify(options));

                        const request = http.request(options, (hostRes) => {
                            hostRes.on('data', (chunk) => {
                                console.log(`Have a chunk ${chunk}`);

                                const split = chunk.toString('utf8').split(/\r?\n/);

                                _.each(split, (s) => {
                                    console.log("Writing " + s);
                                    res.write(`data: ${s}\n`);
                                });

                                res.write("data:\n\n");
                            });

                            hostRes.on('end', () => {
                                clearInterval(ping);
                                res.end();
                                request.destroy();
                            });
                        });

                        console.log("Firing request!");
                        request.end();

                        return req.on('close', () => {
                            request.destroy();
                        });

                            /*
                        request(`http://${hostIP}:3000/logs/applications/${req.params.application}/containers/${req.params.container}?type=${req.query.type || 'stdout'}`, (err, hostRes) => {

                            res.header('Content-Type', 'text/html');
                            res.header('Cache-Control', 'no-cache');
                            res.header('Connection', 'keep-alive');
                            res.header('X-Accel-Buffering', 'no');
                            res.status(200);

                            res.send(`data: ${err} // ${hostRes} \n\n`);

                            //console.log("After end.");
                        });
                        */

                    } else {

                        res.send("Nothing found!");

                    }

                });

                // Find the container with the appropritate applicatin and id.
                // Hit it's server to grab the appropraite file
                
                // Pipe it out.
                
                /*
                console.log("hitting route.");
                fs.readFile(`/var/logs/containership/${req.params.application}/${req.params.container}/stdout`, (err, data) => {
                    if(err) {
                        res.send("With req: " + JSON.stringify(req.params) + " error: " + err);
                    } else {
                        res.send(data);
                    }
                });
                */
            })
            .get("/:apiVersion/logs/hosts/:host", (req, res) => {

            }).value();

    }

}

module.exports = ContainershipLogsPlugin;
