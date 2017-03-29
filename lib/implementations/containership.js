'use strict';

const logs = require('../logs');

const APPLICATION_NAME = 'containership-logs';
const LOGGER_NAME = 'containership-logs';

module.exports = {

    leader: {
        initialize(core) {
            const add_application = () => {
                const DEFAULT_LOG_PATH = core.options['base-log-dir'] || '/var/log/containership';

                core.cluster.myriad.persistence.get(
                        [core.constants.myriad.APPLICATION_PREFIX, APPLICATION_NAME].join(core.constants.myriad.DELIMITER),
                        (err) => {
                            if(err) {
                                return core.applications.add({
                                    id: APPLICATION_NAME,
                                    image: 'containership/docker-cs-logs:latest',
                                    cpus: 0.1,
                                    memory: 64,
                                    container_port: 8000,
                                    tags: {
                                        constraints: {
                                            per_host: 1
                                        },
                                        metadata: {
                                            plugin: APPLICATION_NAME,
                                            ancestry: 'containership.plugin'
                                        }
                                    },
                                    env_vars: {
                                        CSHIP_LOG_PATH: DEFAULT_LOG_PATH
                                    },
                                    volumes: [
                                        {
                                            host: DEFAULT_LOG_PATH,
                                            container: DEFAULT_LOG_PATH
                                        }
                                    ]
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

            return logs.Init(core).register_routes();
        }
    },

    follower: {
        initialize(core) {
            core.loggers[LOGGER_NAME].log('verbose', `${APPLICATION_NAME} does not run on follower nodes.`);
        }
    }

};
