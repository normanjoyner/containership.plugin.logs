'use strict';

const logs = require('./lib/logs');

const _ = require('lodash');
const ContainershipPlugin = require('containership.plugin');


module.exports = new ContainershipPlugin({
    type: 'core',

    initialize: function(core) {
        const DEFAULT_LOG_PATH = core.options['base-log-dir'] || '/var/log/containership';
        const application_name = 'containership-logs';
        core.logger.register(application_name);

        const add_application = () => {
            core.cluster.myriad.persistence.get(
                    [core.constants.myriad.APPLICATION_PREFIX, application_name].join(core.constants.myriad.DELIMITER),
                    (err) => {
                        if(err) {
                            return core.applications.add({
                                id: application_name,
                                image: 'containership/docker-cs-logs:latest',
                                cpus: 0.1,
                                memory: 64,
                                container_port: 8000,
                                tags: {
                                    constraints: {
                                        per_host: 1
                                    },
                                    metadata: {
                                        plugin: application_name,
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
                                core.loggers[application_name].log('verbose', ['Created ', application_name, '!'].join(''));
                            });
                        }

                        return core.loggers[application_name].log('verbose', [application_name, 'already exists, skipping create!'].join(' '));
                    }
            );
        };

        if('leader' === core.options.mode) {
            if(core.cluster.praetor.is_controlling_leader()) {
                add_application();
            }

            core.cluster.legiond.on('promoted', () => {
                core.cluster.myriad.persistence.keys(core.constants.myriad.APPLICATIONS, (err, applications) => {
                    if(err || !_.isEmpty(applications)) {
                        return add_application();
                    }

                    return setTimeout(add_application, 2000);
                });
            });

            return logs.Init(core).register_routes();
        }
    },

    reload: function() {}
});
