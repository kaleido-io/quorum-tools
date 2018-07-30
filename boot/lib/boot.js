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

const EncryptedFile = require('./encrypted-file.js');
const Logging = require('log4js');
const logger = Logging.getLogger('lib/boot.js');
logger.level = 'info';
const fs = EncryptedFile.fs;
const path = require('path');
const net = require('net');
const argv = require('yargs').argv;

const DATADIR = '/qdata';
const DATADIR_DECRYPTED = '/qdata_decrypted';
const CONFIGDIR = '/qdata_config';

const BOOT_CONFIG = 'boot.config';
const KV_CONFIG = 'key-vault-config.json';
const TMCONF = 'constellation/tm.conf';

const constellation = argv.constellation;

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
const txpoolExecutableSize = process.env[`PERF_${consensus}_TXPOOL_SIZE`] || 4096; // default value in Geth 1.7+
const txpoolExecutablePerAccountSize = process.env[`PERF_${consensus}_TXPOOL_PER_ACCOUNT_SIZE`] || 16; // default value in Geth 1.7+
const txpoolNonExecutableSize = process.env[`PERF_${consensus}_TXPOOL_NON_EXEC_SIZE`] || (txpoolExecutableSize / 4); // default value in Geth 1.7+
const txpoolNonExecutablePerAccountSize = process.env[`PERF_${consensus}_TXPOOL_NON_EXEC_PER_ACCOUNT_SIZE`] || 64; // default value in Geth 1.7+
const dbCache = process.env[`PERF_${consensus}_CACHE`] || 128; // default size in Geth 1.7
const trieCacheGens = process.env[`PERF_${consensus}_TRIE_CACHE_GENS`] || 120;

class Bootstrapper {
  constructor() {
    this.configfile = path.join(DATADIR, BOOT_CONFIG);
    this.kvconfigfile = path.join(CONFIGDIR, KV_CONFIG);
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

    if (constellation) {
      // used in Quorum Constellation startup
      let tmConf = path.join(DATADIR, TMCONF);
      try {
        await fs.access(tmConf, fs.constants.R_OK);
  
        // if config says the key materials are encrypted, need to decrypt them and
        // save the decrypted files to the /qdata_decrypted folder
        await this.copyKeyMaterials();
  
        return true;
      } catch(err) {
        logger.info(`Missing constellation config file: ${tmConf}`);
        return false;
      }
    } else {
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

      // if config says the key materials are encrypted, need to decrypt them and
      // save the decrypted files to the /qdata_decrypted folder
      await this.copyKeyMaterials();

      if (consensus === 'IBFT' || consensus === 'RAFT') {
        // for quorum we require constellation node to be ready
        // first check if the required files exist:
        //   - tm.conf
        //   - tm.ipc
        let tmConf = path.join(DATADIR, TMCONF);
        let tmIPC = path.join(DATADIR, 'constellation/tm.ipc');
        try {
          await fs.access(tmConf, fs.constants.R_OK);
        } catch(err) {
          logger.info(`Missing constellation config file: ${tmConf}`);
          return false;
        }

        try {
          await fs.access(tmIPC, fs.constants.R_OK);
        } catch(err) {
          logger.info(`Missing IPC to constellation: ${tmIPC}`);
          return false;
        }

        logger.info('Checking if constellation is ready');
        return new Promise((resolve, reject) => {
          let client = net.createConnection({path: tmIPC})
            .on('connect', () => {
              logger.info(`\tConnected via ${tmIPC}`);
            })
            .on('data', (data) => {
              data = data.toString();
              if (data.indexOf("I'm up!") < 0) {
                logger.info(`\t${data}`);
                client.end();
                return resolve(false);
              }

              logger.info(`\t${data}`);
              client.end();
              return resolve(_config);
            })
            .on('error', (err) => {
              logger.info(`\t${err}`);
              client.end();
              return resolve(false);
            });

          client.write('GET http://c/upcheck HTTP/1.1\r\n');
          client.write('\r\n');
        });
      } else {
        return Promise.resolve(_config);
      }
    }
  }

  async writeCommandLineArgs(config) {
    if (constellation) {
      // no special args for constellation launch
      return;
    }

    const COMMON_ARGS = `--datadir ${DATADIR}/ethereum --nodekey /qdata_decrypted/ethereum/nodekey --targetgaslimit 804247552 --gasprice 0 --txpool.pricelimit 0 --rpc --rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --unlock 0 --password /qdata_decrypted/ethereum/passwords.txt --verbosity 4`;
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
        args = `${args} --raft --rpcapi ${RAFT_APIS} --wsapi ${RAFT_APIS}`;
      } else if (config.raft_id) {
        args = `${args} --raft --rpcapi ${RAFT_APIS} --wsapi ${RAFT_APIS} --raftjoinexisting ${config.raft_id}`;
      }
    }

    args = `${args} --rpccorsdomain '${rpcOrigins}' --wsorigins '${wsOrigins}' --txpool.globalslots ${txpoolExecutableSize} --txpool.accountslots ${txpoolExecutablePerAccountSize} --txpool.globalqueue ${txpoolNonExecutableSize} --txpool.accountqueue ${txpoolNonExecutablePerAccountSize} --cache ${dbCache} --trie-cache-gens ${trieCacheGens} --networkid ${config.network_id}`;
    await fs.writeFile(path.join(DATADIR, 'args.txt'), args);
  }

  async copyKeyMaterials() {
    if (constellation) {
      logger.info('Decrypting and copying constellation tm.key');
      await fs.ensureDir(path.join(DATADIR_DECRYPTED, 'constellation'));
      let tmKey = await this.readKeyMaterialsFromFile(path.join(DATADIR, 'constellation/tm.key'));
      await fs.writeFile(path.join(DATADIR_DECRYPTED, 'constellation/tm.key'), tmKey);
    } else {
      logger.info('Decrypting and copying nodekey');
      await fs.ensureDir(path.join(DATADIR_DECRYPTED, 'ethereum'));

      let nodeKey = await this.readKeyMaterialsFromFile(path.join(DATADIR, 'ethereum/nodekey'));
      await fs.writeFile(path.join(DATADIR_DECRYPTED, 'ethereum/nodekey'), nodeKey);

      logger.info('Decrypting and copying account passwords.txt');
      let password = await this.readKeyMaterialsFromFile(path.join(DATADIR, 'ethereum/passwords.txt'));
      await fs.writeFile(path.join(DATADIR_DECRYPTED, 'ethereum/passwords.txt'), password);
    }
  }

  async isKeyVaultEnabled() {
    if (!this._isKeyVaultEnabled) {
      try {
        let config = await fs.readFile(this.kvconfigfile);
        config = JSON.parse(config.toString());
        if (config.provider) {
          this._isKeyVaultEnabled = true;
        } else {
          this._isKeyVaultEnabled = false;
        }
      } catch(err) {
        this._isKeyVaultEnabled = false;
      }
    }

    return this._isKeyVaultEnabled;
  }

  async readKeyMaterialsFromFile(path) {
    let isKeyVaultEnabled = await this.isKeyVaultEnabled();

    if (isKeyVaultEnabled) {
      let config = await fs.readFile(this.kvconfigfile);
      let options = JSON.parse(config.toString());
      let encryptedFile = new EncryptedFile(path, options);
      return await encryptedFile.read();
    } else {
      return await fs.readFile(path);
    }
  }
}

module.exports = Bootstrapper;
// for testing purposes only
module.exports.fs = fs;
