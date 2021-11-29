# Build and Test Quorum and Constellation with Docker

This tests the setup to have Quorum (based on go-ethereum), without a private transaction manager, to be built in docker and run in separate docker instances.

## Pre-requisite

### Repositories

This repository depends on the following repositories to be cloned and reside next to it:
```
git clone git@github.com:kaleido-io/quorum-tools.git
git clone -b v21.4.2 git@github.com:kaleido-io/quorum.git
git clone git@github.com:getamis/istanbul-tools.git
```

Build the docker images by launching from the project root:
```
make docker
```

It should produce the following docker images:

| Image                            | Description           | Needed for runtime? |
| -------------------------------- |:---------------------:| -------------------:|
| jpmorganchase/quorum             | geth node             | YES                 |
| jpmorganchase/quorum-builder     | build environment     | NO                  |
| istanbul-tools                   | IBFT CLI Tool         | NO                  |

### Tools

`setup.sh` depends upon [jq](https://stedolan.github.io/jq/).  Please ensure this `jq` is installed

## Generate configuration artifacts and docker-compose.yml

```
cd examples
./setup.sh
```

The *setup.sh* script creates a basic Quorum network with Raft consensus. There's a whole bunch of things it needs to do in order to achieve this, some specific to Quorum, some common to private Ethereum chains in general.

The following arguments are supported:
```
-n, --nodes         Number of Quorum nodes to generate. Default: 5. Can use "x+y" syntax to specify validators and non-validators. For instance, "./setup.sh -n 3+2 -c ibft" means generating 3 validators and 2 non-validators
-c, --consensus     Consensus to use. Valid values are raft and ibft. Default: raft
-b, --blockperiod   Applicable to IBFT only. The interval to produce blocks. The closely related parameter, istanbul.requesttimeout, will be automatically calculated by adding 10sec to the blockperiod value in order to make the configuration work.
```

1. bootnode
A bootnode is used in the network so that the geth nodes does not attempt to contact the well-known nodes in the public networks during p2p discovery. The script generates a node key for the bootnode and calculates its public address to be used in the geth node's `--bootnodes` argument.

2. for each Quorum node
The script generates all configuration files for the geth node in the `ethereum` folder. Inside the folder:

 * *nodekey* file to uniquely identify this node on the network.
 * *static-nodes.json* file that lists the Enode IDs of nodes that participate in the initial Raft cluster. Additional nodes can be added to the Raft cluster which is described [here](#adding-new-nodes-to-an-existing-network).
 * *permissioned-nodes.json* file that captures the list of Enode IDs allowed to connect to each other in this network instance.
 * Ether accounts are generated in the *keystore* directory
   * The accounts get written into the *genesis.json* file with an initial balance

3. docker-compose.yml
This makes it trivial to launch the network

Refer to the *setup.sh* file itself for the full code.

## Launch the network

run the command below from the `examples` directory

```
docker-compose -f tmp/docker-compose.yml up
```

## Advanced Topics

### Quorum configuration directory structure

The configuration files for the Quorum nodes in Quorum are saved under the `ethereum` directory:

    /qdata/
    ├── ethereum/
    │   ├── geth/
    │   ├── keystore/
    │   │   └── UTC--2017-10-21T12-49-26.422099203Z--aad5479aff498c9258b21b59dd7546262aa2cfc7
    │   ├── nodekey
    │   ├── passwords.txt
    │   ├── genesis.json
    │   ├── static-nodes.json
    │   └── permissioned-nodes.json
    └── logs/

On the Docker host, a *qdata_N/* directory for each node is created with the structure above. When the network is started, this will be mapped by the *docker-compose.yml* file to each container's internal */qdata/* directory.

### Adding new nodes to an existing network

The docker image jpmorganchase/quorum uses a startup script that is designed to start the node in one of the following modes:
1. part of the initial Raft cluster. Notice in the docker-compose.yml file, the following command is used for this purpose:
```
command: start.sh --bootnode="enode://c3475a286a...6ebc6@172.13.0.100:30301" --raftInit
```
2. new node joining an existing network. You can modify the docker service start command as the following:
```
command: start.sh --bootnode="enode://c3475a286a...6ebc6@172.13.0.100:30301" --raftID=5
```
Note: the number `5` is the placeholder of the Raft node ID returned by calling `raft.addPeer()` in the geth console connected to an existing geth node of the network.

3. an IBFT node:
```
command: start.sh --bootnode="enode://c3475a286a...6ebc6@172.13.0.100:30301" --ibft
```
4. an IBFT node using 5 seconds block period:
```
command: start.sh --bootnode="enode://c3475a286a...6ebc6@172.13.0.100:30301" --ibft --blockperiod=5
```
