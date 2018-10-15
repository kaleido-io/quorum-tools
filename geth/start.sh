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
### "boot.config" is found with property "bootnode".
###
### If the raft* argument is omitted, the program assumes this is joining an existing
### cluster, and enters a sleep loop until a file "boot.config" with "raft_id" is found.
###

set -e

node /usr/local/src/index.js $@

CHAIN_RECONFIG_MARKER_FILE="/qdata/ethereum/.chain_reconfigure"

if [ ! -f /qdata/args.txt ]; then
  echo "!!! FATAL !!! - missing /qdata/args.txt, unable to start geth"
  exit 1
fi


#
# ALL SET!
#
if [ ! -d /qdata/ethereum/chaindata ] || [ -f $CHAIN_RECONFIG_MARKER_FILE ]; then
  echo "[*] Setting up chain config & genesis block"
  geth --datadir /qdata/ethereum init /qdata/ethereum/genesis.json
  # remove the chain reconfig marker file
  rm -f $CHAIN_RECONFIG_MARKER_FILE
fi

GETH_ARGS=`cat /qdata/args.txt`
echo "[*] Starting node with args $GETH_ARGS"
export PRIVATE_CONFIG=/qdata/constellation/tm.conf
sh -c "geth $GETH_ARGS 2>>/qdata/logs/geth.log" &
pid=$!
# Geth wants SIGINT instead of SIGTERM
trap "kill -INT $pid" SIGTERM
# Also just forward the SIGKILL when received.
trap "kill -9 $pid" SIGKILL
wait $pid
