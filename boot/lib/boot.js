// Copyright 2018 Kaleido, a ConsenSys business

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

const Logging = require('log4js');
const logger = Logging.getLogger('lib/boot.js');
logger.level = 'info';
const fs = require('fs-extra');
const path = require('path');
const argv = require('yargs').argv;

const DATADIR = '/qdata';
const BOOT_CONFIG = 'boot.config';

const poa = argv.poa;
const ibft = argv.ibft;
const raftInit = argv.raftInit;
const raftID = argv.raftID;
const networkID = argv.networkid;
const bootnode = argv.bootnode;
const blockPeriod = argv.blockperiod;
const roundChangeTimer = argv.roundchangetimer;

const rpcOrigins = argv.rpcOrigins || "*";
const wsOrigins = argv.wsOrigins || "*";
const consensus = (poa) ? 'POA' : ((ibft) ? 'IBFT' : 'RAFT');

class Bootstrapper {
  constructor() {
    this.configfile = path.join(DATADIR, BOOT_CONFIG);
  }

  async checkDependencies() {
    let config;
    let data;
    try {
      data = await fs.readFile(this.configfile);
    } catch(err) {
      logger.info(`No ${this.configfile} found, will look for required parameters in the command line args`);
    }

    if (!data) data = '{}';

    config = JSON.parse(data.toString());

    // used in Geth or Quorum startup
    let _bootnode = bootnode || config.bootnode;
    if (!_bootnode) return false;
    logger.info(`bootnode: ${_bootnode}`);

    let _networkID = networkID || config.network_id;
    if (!_networkID) return false;
    logger.info(`networkid: ${_networkID}`);

    let _config = {
      bootnode: _bootnode,
      network_id: _networkID
    };

    let _raftID = raftID || config.raft_id;
    if (consensus === 'RAFT' && !raftInit) {
      // require raftID is not IBFT and not initial RAFT node
      if (!_raftID) return false;
      logger.info(`raftID: ${_raftID}`);
      _config.raft_id = _raftID;
    }

    return Promise.resolve(_config);
  }

  async writeCommandLineArgs(config) {
    const COMMON_ARGS = `--datadir ${DATADIR}/ethereum --nodekey /qdata/ethereum/nodekey --targetgaslimit 804247552 --miner.gasprice 0 --txpool.pricelimit 0 --port 30303 --rpc --rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --allow-insecure-unlock --unlock 0 --password /qdata/ethereum/passwords.txt --verbosity 4 --nousb`;
    const COMMON_APIS = "admin,db,eth,debug,miner,net,shh,txpool,personal,web3";
    const RAFT_APIS = `${COMMON_APIS},raft`;
    const IBFT_APIS = `${COMMON_APIS},istanbul`;
    const POA_APIS = `${COMMON_APIS},clique`;

    let args = `${COMMON_ARGS} --bootnodes ${config.bootnode}`;

    if (consensus === 'POA') {
      args = `${args} --syncmode full --mine --rpcapi ${POA_APIS} --wsapi ${POA_APIS}`;
    } else {
      // for Quorum always turn on "permissioned"
      args = `${args} --permissioned`;

      if (ibft) {
        args = `${args} --syncmode full --mine --rpcapi ${IBFT_APIS} --wsapi ${IBFT_APIS}`;

        if (blockPeriod) {
          args = `${args} --istanbul.blockperiod ${blockPeriod} --istanbul.requesttimeout ${roundChangeTimer}`;
        }
      } else if (raftInit) {
        args = `${args} --raft --raftport 50400 --rpcapi ${RAFT_APIS} --wsapi ${RAFT_APIS}`;
      } else if (config.raft_id) {
        args = `${args} --raft --raftport 50400 --rpcapi ${RAFT_APIS} --wsapi ${RAFT_APIS} --raftjoinexisting ${config.raft_id}`;
      }
    }

    args = `${args} --rpccorsdomain '${rpcOrigins}' --wsorigins '${wsOrigins}' --rpcvhosts '*' --networkid ${config.network_id}`;
    await fs.writeFile(path.join(DATADIR, 'args.txt'), args);
  }
}

module.exports = Bootstrapper;
