#!/bin/bash

#
# Create all the necessary scripts, keys, configurations etc. to run
# a cluster of N Quorum nodes with Raft consensus.
#
# The nodes will be in Docker containers. List the IP addresses that
# they will run at below (arbitrary addresses are fine).
#
# Run the cluster with "docker-compose up -d"
#
# Run a console on Node N with "geth attach qdata_N/ethereum/geth.ipc"
# (assumes Geth is installed on the host.)
#
# Quorum logfiles for Node N will be in qdata_N/logs/
#

# TODO: check file access permissions, especially for keys.

CONSENSUS="raft"
NUMNODES=5
BLOCKPERIOD=1

while [[ $# -gt 0 ]]
do
key="$1"

case $key in
    -c|--consensus)
    CONSENSUS="$2"
    shift # past argument
    shift # past value
    ;;
    -n|--nodes)
    NUMNODES="$2"
    shift # past argument
    shift # past value
    ;;
    -b|--blockperiod)
    BLOCKPERIOD="$2"
    shift # past argument
    shift # past value
    ;;
    *)    # unknown option
    shift # past argument
    ;;
esac
done

echo "Consensus:        $CONSENSUS"
echo "Number of Nodes:  $NUMNODES"
echo "Block Period:     $BLOCKPERIOD"

if [[ $NUMNODES == *"+"* ]]; then
  IFS='+' read -ra ARR <<< "$NUMNODES"
  NUM_VALIDATORS=${ARR[0]}
  NUM_NON_VALIDATORS=${ARR[1]}
  NUMNODES=$(( $NUM_VALIDATORS + $NUM_NON_VALIDATORS ))
else
  NUM_VALIDATORS=$NUMNODES
  NUM_NON_VALIDATORS=0
fi

mkdir tmp-ibft
cd tmp-ibft
pwd=`pwd`

if [[ "$CONSENSUS" == "ibft" ]]
then
  cp ../../istanbul/scripts/run.sh ./
  echo "Generating an IBFT network with $NUM_VALIDATORS nodes"
  bash -c "docker run -it -v $pwd:/ibft istanbul-tools sh -c \"/ibft/run.sh --nodes $NUM_VALIDATORS\""
fi

#### Configuration options #############################################

# One Docker container will be configured for each IP address in $ips
subnet="172.13.0.0/16"
ips=()
for i in $(seq 1 $NUMNODES)
do
    ips+=("172.13.$((1 + i * 2)).1")
done

# Docker image name
image_quorum=jpmorganchase/quorum

cd ../
rm -rf tmp
mkdir tmp
cd tmp
pwd=`pwd`

########################################################################

#### Create directory for bootnode's configuration ##################
echo '[0] Configuring for bootnode'

mkdir qdata_0
bootnode_cmd="docker run -it -v $pwd/qdata_0:/qdata $image_quorum /usr/local/bin/bootnode"
$bootnode_cmd -genkey /qdata/nodekey
bootnode_enode=`$bootnode_cmd -nodekey /qdata/nodekey -writeaddress | tr -d '[:space:]'`
echo "bootnode id: $bootnode_enode"


#### Make static-nodes.json and store keys #############################

echo '[1] Creating Enodes and static-nodes.json.'

echo "[" > static-nodes.json

for i in $(seq 1 $NUMNODES)
do
  k=$((i-1))
  qd=qdata_$i
  ip=${ips[$k]}
  mkdir -p $qd/logs
  mkdir -p $qd/ethereum/geth
  touch $qd/logs/dummy.txt

  bootnode_cmd="docker run -it -v $pwd/$qd:/qdata $image_quorum /usr/local/bin/bootnode"

  if [[ "$CONSENSUS" == "ibft" && $i -le $NUM_VALIDATORS ]]
  then
    # for IBFT validators, all key materials have already been generated in the previous step
    # just copy them over
    cp ../tmp-ibft/$k/nodekey $qd/ethereum/
  else
    # for Raft or IBFT non-validators, generate from scratch
    $bootnode_cmd -genkey /qdata/ethereum/nodekey
  fi

  enode=`$bootnode_cmd -nodekey /qdata/ethereum/nodekey -writeaddress | tr -d '[:space:]'`
  echo "  Node $i id: $enode"

  # Add the enode to static-nodes.json
  sep=`[[ $i < $NUMNODES ]] && echo ","`
  echo '  "enode://'$enode'@'$ip':30303?discport=0&raftport=50400"'$sep >> static-nodes.json

done

echo "]" >> static-nodes.json

#### Create accounts, keys and genesis.json file #######################

echo '[2] Creating Ether accounts and genesis.json.'

# generate the allocated accounts section to be used in both Raft and IBFT
for i in $(seq 1 $NUMNODES)
do
    qd=qdata_$i

    # Generate an Ether account for the node
    touch $qd/ethereum/passwords.txt
    create_account="docker run -v $pwd/$qd:/qdata $image_quorum /usr/local/bin/geth --datadir=/qdata/ethereum --password /qdata/ethereum/passwords.txt account new"
    account1=`$create_account | awk -F'[:]' '{print $2}' | grep 0x | xargs`
    echo "  Accounts for node $i: $account1"

    # Add the account to the genesis block so it has some Ether at start-up
    sep=`[[ $i < $NUMNODES ]] && echo ","`
    cat >> alloc.json <<EOF
    "${account1}": { "balance": "1000000000000000000000000000" }${sep}
EOF
done

if [[ "$CONSENSUS" == "ibft" ]]
then
  # for IBFT, all key materials have already been generated in the previous step
  # just copy them over
  # replace the alloc section
  ALLOC=`cat alloc.json`
  cat ../tmp-ibft/genesis.json | jq ". | .alloc = {$ALLOC}" > genesis.json
else
  # for Raft, generate from scratch
  cat > genesis.json <<EOF
{
  "alloc": {
EOF

  cat alloc.json >> genesis.json

  cat >> genesis.json <<EOF
  },
  "coinbase": "0x0000000000000000000000000000000000000000",
  "config": {
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "isQuorum": true,
    "chainId": 3543006677
  },
  "difficulty": "0x0",
  "mixhash": "0x00000000000000000000000000000000000000647572616c65787365646c6578",
  "gasLimit": "0x2FEFD800",
  "nonce": "0x0",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "timestamp": "0x00"
}
EOF
fi


#### Complete each node's configuration ################################

echo '[3] Preparing data directories for each node'

for i in $(seq 1 $NUMNODES)
do
  qd=qdata_$i

  cp genesis.json $qd/ethereum/genesis.json
  cp static-nodes.json $qd/ethereum/static-nodes.json
  cp static-nodes.json $qd/ethereum/permissioned-nodes.json

  let n++
done
rm -rf genesis.json static-nodes.json alloc.json ../tmp-ibft

#### Create the docker-compose file ####################################

echo '[4] Generating docker-compose.yml'

cat > docker-compose.yml <<EOF
version: '2'
services:
  bootnode:
    container_name: bootnode
    image: $image_quorum
    command: bootnode -nodekey /qdata/nodekey
    volumes:
      - './qdata_0:/qdata'
    networks:
      quorum_net:
        ipv4_address: '172.13.0.100'

EOF

PARAM="raftInit"
BLOCKPARAM=""
if [[ "$CONSENSUS" == "ibft" ]]
then
  PARAM="ibft"
  BLOCKPARAM="--blockperiod=$BLOCKPERIOD --roundchangetimer=$(((BLOCKPERIOD + 10) * 1000))"
fi

for index in ${!ips[*]}; do 
    n=$((index+1))
    qd=qdata_$n
    ip=${ips[index]}; 
    cip=${cips[index]}; 

    cat >> docker-compose.yml <<EOF
  node_$n:
    container_name: node_$n
    image: $image_quorum
    command: start.sh --bootnode="enode://$bootnode_enode@172.13.0.100:30301" --$PARAM $BLOCKPARAM --networkid 2018
    volumes:
      - './$qd:/qdata'
    networks:
      quorum_net:
        ipv4_address: '$ip'
    ports:
      - $((n+22000)):8545
      - $((n+23000)):8546 
    depends_on:
      - bootnode

EOF
done

cat >> docker-compose.yml <<EOF

networks:
  quorum_net:
    driver: bridge
    ipam:
      driver: default
      config:
      - subnet: $subnet
EOF
