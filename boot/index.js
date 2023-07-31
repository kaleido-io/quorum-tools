// Copyright 2023 Kaleido, a ConsenSys business

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
})
.catch(err => {
  logger.error("Bootstrap failed", err)
  process.exit(1);
});
