'use strict';

const logger = require('log4js').getLogger('index.js');
logger.level = 'info';
const Bootstrapper = require('./lib/boot.js');
const util = require('util');
const promisify = util.promisify;
const timers = {
  sleep: promisify(require('timers').setTimeout),
  setInterval: require('timers').setInterval
};

let bootstrapper = new Bootstrapper();

async function check() {
  logger.info('Checking dependencies');
  let config = await bootstrapper.checkDependencies();

  while (!config) {
    await timers.sleep(2000); // 1 second before checking again
    logger.info('Checking dependencies');
    config = await bootstrapper.checkDependencies();
  }

  return config;
}

check()
.then(async (config) => {
  logger.info(util.format('Configurations: %j', config));
  await bootstrapper.writeCommandLineArgs(config);
});