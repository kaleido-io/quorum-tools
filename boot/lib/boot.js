/* Copyright (C) 2018 Kaleido, a ConsenSys business - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
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

const BOOT_CONFIG = 'ethereum/boot.config';
const TMCONF = 'constellation/tm.conf';

const poa = argv.poa;
const ibft = argv.ibft;
const raftInit = argv.raftInit;
const raftID = argv.raftID;
const networkID = argv.networkid;
const bootnode = argv.bootnode;
const blockPeriod = argv.blockperiod;
const roundChangeTimer = argv.roundChangeTimer;

const wsOrigins = argv.wsOrigins || "*";
const consensus = (poa) ? 'POA' : ((ibft) ? 'IBFT' : 'RAFT');
const txpoolSize = process.env[`PERF_${consensus}_TXPOOL_SIZE`] || 4096; // default value in Geth 1.7+
const dbCache = process.env[`PERF_${consensus}_CACHE`] || 128; // default size in Geth 1.7
const trieCacheGens = process.env[`PERF_${consensus}_TRIE_CACHE_GENS`] || 120;

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

    if (consensus !== 'POA') {
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

  async writeCommandLineArgs(config) {
    const COMMON_ARGS = `--datadir ${DATADIR}/ethereum --gasprice 0 --txpool.pricelimit 0 --rpc --rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --unlock 0 --password /qdata/ethereum/passwords.txt --verbosity 4`;
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
      } else if (raftID) {
        args = `${args} --raft --rpcapi ${RAFT_APIS} --wsapi ${RAFT_APIS} --raftjoinexisting ${raftID}`;
      }
    }

    args = `${args} --wsorigins=${wsOrigins} --txpool.globalslots=${txpoolSize} --txpool.globalqueue ${txpoolSize / 4} --cache=${dbCache} --trie-cache-gens ${trieCacheGens} --networkid ${config.network_id}`;
    await fs.writeFile(path.join(DATADIR, 'args.txt'), args);
  }

  async isKeyVaultEnabled() {
    if (!this._isKeyVaultEnabled) {
      try {
        await fs.access(path.join(this.dataDir, 'key-vault.config'), fs.constants.R_OK);
        this._isKeyVaultEnabled = true;
      } catch(err) {
        this._isKeyVaultEnabled = false;
      }
    }

    return this._isKeyVaultEnabled;
  }

  async readKeyMaterialsFromFile(path) {
    let isKeyVaultEnabled = await this.isKeyVaultEnabled();

    if (isKeyVaultEnabled) {
      let config = await fs.readFile();
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
