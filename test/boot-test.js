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

const chai = require('chai');
const sinon = require('sinon');
chai.use(require('sinon-chai'));
const expect = chai.expect;
const nock = require('nock');
const net = require('net');
const fs = require('fs-extra');

describe('writeCommandLineArgs()', () => {
  let mockServer;

  afterEach(() => {
    delete require.cache[require.resolve('../boot/node_modules/yargs')];
    delete require.cache[require.resolve('../boot/lib/boot.js')];
  });

  it('handles non-existing boot.config', async () => {
    const Boot = require('../boot/lib/boot.js');
    sinon.stub(Boot.fs, 'readFile').withArgs('/qdata/ethereum/boot.config').rejects();

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();
    let _config = await bootstrapper.checkDependencies();
    expect(_config).to.be.false;
    Boot.fs.readFile.restore();
  });

  it('checks dependencies for IBFT', async () => {
    let oldArgv = process.argv.slice(0);

    process.argv.push('--ibft');
    process.argv.push('--networkid');
    process.argv.push('23456');
    process.argv.push('--bootnode');
    process.argv.push('enode://bcdefg@1.2.3.7:30301');

    const Boot = require('../boot/lib/boot.js');
    let config = {
      bootnode: 'enode://abcdef@1.2.3.4:30301',
      network_id: 12345
    };

    sinon.stub(Boot.fs, 'readFile').withArgs('/qdata/ethereum/boot.config').resolves(Buffer.from(JSON.stringify(config)));
    sinon.stub(Boot.fs, 'access').resolves();

    fs.removeSync('/qdata/constellation/tm.ipc');

    mockServer = net.createServer((stream) => {
      stream.on('data', (msg) => {
        stream.write("I'm up!");
        stream.pipe(stream);
        mockServer.close();
      });
    })
    .listen('/qdata/constellation/tm.ipc');

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();
    let _config = await bootstrapper.checkDependencies();
    expect(_config.bootnode).to.equal('enode://bcdefg@1.2.3.7:30301');
    expect(_config.network_id).to.equal(23456);

    Boot.fs.readFile.restore();
    Boot.fs.access.restore();
    process.argv = oldArgv;
  });

  it('writes proper args for IBFT', () => {
    let oldArgv = process.argv.slice(0);
    let oldEnv = Object.assign({}, process.env);

    process.argv.push('--ibft');
    process.argv.push('--blockperiod');
    process.argv.push('5');
    process.argv.push('--roundchangetimer');
    process.argv.push('15');
    process.env['PERF_IBFT_TXPOOL_SIZE'] = 128;
    process.env['PERF_IBFT_CACHE'] = 64;
    process.env['PERF_IBFT_TRIE_CACHE_GENS'] = 128;

    const Boot = require('../boot/lib/boot.js');

    sinon.stub(Boot.fs, 'writeFile');

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();
    bootstrapper.writeCommandLineArgs({ bootnode: 'enode://bcdefg@1.2.3.7:30301', network_id: 12345 });

    expect(Boot.fs.writeFile).calledWith(
      '/qdata/args.txt',
      '--datadir /qdata/ethereum --nodekey /qdata_decrypted/ethereum/nodekey --gasprice 0 --txpool.pricelimit 0 --rpc ' +
      '--rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --unlock 0 --password /qdata_decrypted/ethereum/passwords.txt ' +
      '--verbosity 4 --bootnodes enode://bcdefg@1.2.3.7:30301 --permissioned --syncmode full --mine --rpcapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,istanbul ' +
      '--wsapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,istanbul --istanbul.blockperiod 5 --istanbul.requesttimeout 15 ' +
      '--wsorigins=* --txpool.globalslots=128 --txpool.globalqueue 32 --cache=64 --trie-cache-gens 128 --networkid 12345'
    );

    Boot.fs.writeFile.restore();
    process.env = oldEnv;
    process.argv = oldArgv;
  });

  it('checks dependencies for RAFT initial node', async () => {
    let oldArgv = process.argv.slice(0);

    process.argv.push('--raftInit');

    const Boot = require('../boot/lib/boot.js');
    let config = {
      bootnode: 'enode://abcdef@1.2.3.4:30301',
      network_id: 34567
    };

    sinon.stub(Boot.fs, 'readFile').withArgs('/qdata/ethereum/boot.config').resolves(Buffer.from(JSON.stringify(config)));
    sinon.stub(Boot.fs, 'access').resolves();

    fs.removeSync('/qdata/constellation/tm.ipc');

    mockServer = net.createServer((stream) => {
      stream.on('data', (msg) => {
        stream.write("I'm up!");
        stream.pipe(stream);
        mockServer.close();
      });
    })
    .listen('/qdata/constellation/tm.ipc');

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();
    let _config = await bootstrapper.checkDependencies();
    expect(_config.bootnode).to.equal('enode://abcdef@1.2.3.4:30301');
    expect(_config.network_id).to.equal(34567);

    Boot.fs.readFile.restore();
    Boot.fs.access.restore();
    process.argv = oldArgv;
  });

  it('writes proper args for RAFT initial node', () => {
    let oldArgv = process.argv.slice(0);
    let oldEnv = Object.assign({}, process.env);

    process.argv.push('--raftInit');
    process.env['PERF_RAFT_TXPOOL_SIZE'] = 128;
    process.env['PERF_RAFT_CACHE'] = 64;
    process.env['PERF_RAFT_TRIE_CACHE_GENS'] = 128;

    const Boot = require('../boot/lib/boot.js');

    sinon.stub(Boot.fs, 'writeFile');

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();

    bootstrapper.writeCommandLineArgs({ bootnode: 'enode://bcdefg@1.2.3.7:30301', network_id: 12345 });

    expect(Boot.fs.writeFile.getCall(0).args[0]).to.equal('/qdata/args.txt');
    expect(Boot.fs.writeFile.getCall(0).args[1]).to.equal(
      '--datadir /qdata/ethereum --nodekey /qdata_decrypted/ethereum/nodekey --gasprice 0 --txpool.pricelimit 0 --rpc ' +
      '--rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --unlock 0 --password /qdata_decrypted/ethereum/passwords.txt ' +
      '--verbosity 4 --bootnodes enode://bcdefg@1.2.3.7:30301 --permissioned --raft --rpcapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,raft ' +
      '--wsapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,raft ' +
      '--wsorigins=* --txpool.globalslots=128 --txpool.globalqueue 32 --cache=64 --trie-cache-gens 128 --networkid 12345');

    Boot.fs.writeFile.restore();
    process.env = oldEnv;
    process.argv = oldArgv;
  });

  it('writes proper args for RAFT other node based on args', () => {
    let oldArgv = process.argv.slice(0);
    let oldEnv = Object.assign({}, process.env);

    process.argv.push('--raftID');
    process.argv.push('5');

    const Boot = require('../boot/lib/boot.js');

    sinon.stub(Boot.fs, 'writeFile');

    let bootstrapper = new Boot();
    sinon.stub(bootstrapper, 'copyKeyMaterials').resolves();
    bootstrapper.writeCommandLineArgs({ bootnode: 'enode://bcdefg@1.2.3.7:30301', network_id: 12345, raft_id: '5' });

    expect(Boot.fs.writeFile.getCall(0).args[0]).to.equal('/qdata/args.txt');
    expect(Boot.fs.writeFile.getCall(0).args[1]).to.equal(
      '--datadir /qdata/ethereum --nodekey /qdata_decrypted/ethereum/nodekey --gasprice 0 --txpool.pricelimit 0 --rpc ' +
      '--rpcport 8545 --rpcaddr 0.0.0.0 --ws --wsport 8546 --wsaddr 0.0.0.0 --unlock 0 --password /qdata_decrypted/ethereum/passwords.txt ' +
      '--verbosity 4 --bootnodes enode://bcdefg@1.2.3.7:30301 --permissioned --raft --rpcapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,raft ' +
      '--wsapi admin,db,eth,debug,miner,net,shh,txpool,personal,web3,raft --raftjoinexisting 5 ' +
      '--wsorigins=* --txpool.globalslots=4096 --txpool.globalqueue 1024 --cache=128 --trie-cache-gens 120 --networkid 12345');

    Boot.fs.writeFile.restore();
    process.env = oldEnv;
    process.argv = oldArgv;
  });
});