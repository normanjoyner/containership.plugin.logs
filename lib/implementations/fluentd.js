'use strict';

const _ = require('lodash');

const child_process = require('child_process');

const APPLICATION_NAME = 'fluentd-logs';
const FLUENTD_PORT = 24224;
const LOGGER_NAME = 'containership-logs';

module.exports = {

    leader: {
        initialize(core) {
            const add_application = () => {
                core.cluster.myriad.persistence.get(
                        [core.constants.myriad.APPLICATION_PREFIX, APPLICATION_NAME].join(core.constants.myriad.DELIMITER),
                        (err) => {
                            if(err) {
                                return core.applications.add({
                                    container_port: FLUENTD_PORT,
                                    cpus: 0.1,
                                    env_vars: {},
                                    id: APPLICATION_NAME,
                                    image: 'containership/fluentd-logs:latest',
                                    memory: 64,
                                    network_mode: 'host',
                                    tags: {
                                        constraints: {
                                            per_host: 1
                                        },
                                        metadata: {
                                            plugin: APPLICATION_NAME,
                                            ancestry: 'containership.plugin'
                                        }
                                    },
                                    volumes: []
                                }, () => {
                                    core.loggers[LOGGER_NAME].log('verbose', `Created ${APPLICATION_NAME}!`);
                                });
                            }

                            return core.loggers[LOGGER_NAME].log('verbose', `${APPLICATION_NAME} already exists, skipping create!`);
                        }
                );
            };

            if(core.cluster.praetor.is_controlling_leader()) {
                add_application();
            }

            core.cluster.legiond.on('myriad.bootstrapped', () => {
                add_application();
            });
        }
    },

    follower: {
        initialize(core) {
            core.scheduler.follower.container.set_start_arguments('docker', 'HostConfig.LogConfig.Type', 'fluentd');

            child_process.exec('ifconfig docker0 | grep \'inet addr\' | awk -F: \'{print $2}\' | awk \'{print $1}\'', (err, stdout) => {
                if(err) {
                    core.loggers[LOGGER_NAME].log('error', 'Error parsing bridge interface address');
                    return JSON.stringify({});
                }

                const bridge_ip = _.trim(stdout);

                core.scheduler.follower.container.set_start_arguments('docker', 'HostConfig.LogConfig.Config', (options) => {
                    const fluentd_address = options.network_mode === 'host' ? '127.0.0.1' : bridge_ip;

                    return JSON.stringify({
                        env: _.keys(options.env_vars).join(','),
                        'fluentd-address': `${fluentd_address}:${FLUENTD_PORT}`,
                        'fluentd-async-connect': 'true',
                        tag: options.env_vars.CONTAINERSHIP_FLUENTD_TAG || `${options.env_vars.CS_CLUSTER_ID}:${options.env_vars.CS_APPLICATION}:${options.id}`
                    });
                });
            });
        }
    }

};
