#!/bin/bash

#
# This is used at Container start up to run the constellation and geth nodes
#

set -u
set -e

### Configuration Options
TMCONF=/qdata/constellation/tm.conf

#
# we cannot start until tm.conf is available
#
echo "[*] TMCONF=$TMCONF"
while [ ! -f $TMCONF ]
do
  sleep 2
done

echo "[*] Starting Constellation node"
nohup /usr/local/bin/constellation-node $TMCONF -v3 2>>/qdata/logs/constellation.log

