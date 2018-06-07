#!/bin/bash

#
# This is used at Container start up to run the constellation and geth nodes
#

###
### These are the arguments supported:
### bootnode=<enode> - argument is the enode URI of the bootnode
### raftInit - to indicate that this node is part of the initial raft quorum/cluster
### raftID=<number> - to indicate that this node is joining an existing quorum/cluster
### ibft - to indicate using Istanbul BFT as the consensus algorithm, instead of Raft
###
### raftInit and raftID are mutually exclusive
###
### if ibft is specified, both raftInit and raftID are ignored
###
### If the bootnode argument is omitted, the program enters a sleep loop until a file
### "bootnode.info" is found.
###
### If the raft* argument is omitted, the program assumes this is joining an existing
### cluster, and enters a sleep loop until a file "raft.id" is found.
###

node /usr/local/src/index.js $@
GETH_ARGS=`cat /qdata/args.txt`

#
# ALL SET!
#
if [ ! -d /qdata/ethereum/geth/chaindata ]; then
  echo "[*] Mining Genesis block"
  geth --datadir /qdata/ethereum init /qdata/ethereum/genesis.json
fi

echo "[*] Starting node with args $GETH_ARGS"
PRIVATE_CONFIG=/qdata/constellation/tm.conf nohup geth $GETH_ARGS 2>>/qdata/logs/geth.log
