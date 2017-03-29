'use strict';

const implementations = require('./lib/implementations');

const ContainershipPlugin = require('containership.plugin');

const APPLICATION_NAME = 'containership-logs';

module.exports = new ContainershipPlugin({
    type: 'core',
    name: 'logs',

    runCLI() {},

    runFollower(core) {
        core.logger.register(APPLICATION_NAME);

        const config = this.get_config('core') || {};
        const log_implementation = config.implementation || 'containership';

        if(implementations[log_implementation]) {
            implementations[log_implementation].follower.initialize(core);
        } else {
            core.loggers[APPLICATION_NAME].log('warn', `Unable to configure ${APPLICATION_NAME}. Invalid log implementation '${log_implementation}' provided`);
        }
    },

    runLeader(core) {
        core.logger.register(APPLICATION_NAME);

        const config = this.get_config('core') || {};
        const log_implementation = config.implementation || 'containership';

        if(implementations[log_implementation]) {
            implementations[log_implementation].leader.initialize(core);
        } else {
            core.loggers[APPLICATION_NAME].log('warn', `Unable to configure ${APPLICATION_NAME}. Invalid log implementation '${log_implementation}' provided`);
        }
    },

    initialize(core) {
        if(!core || !core.logger) {
            return module.exports.runCLI();
        } else if(core.options.mode === 'leader') {
            return module.exports.runLeader(core);
        } else if(core.options.mode === 'follower') {
            return module.exports.runFollower(core);
        } else if(core.logger) {
            core.logger.register(APPLICATION_NAME);
            core.loggers[APPLICATION_NAME].log('error', `Invalid configuration found when initializing ${APPLICATION_NAME} plugin!`);
        }
    },

    reload() {}
});
