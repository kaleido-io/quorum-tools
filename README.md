# Build and Test Quorum and Constellation with Docker

This tests the setup to have Quorum (based on go-ethereum), without a private transaction manager, to be built in docker and run in separate docker instances.

## Pre-requisite

### Repositories

This repository depends on the following repositories to be cloned and reside next to it:

```
git clone -b v23.4.0 git@github.com:kaleido-io/quorum.git
```

Build the docker images by launching from the project root of `quorum-tools`:

```
make docker
```

It should produce the following docker images:

| Image                        |    Description    | Needed for runtime? |
| ---------------------------- | :---------------: | ------------------: |
| jpmorganchase/quorum         |     geth node     |                 YES |
| jpmorganchase/quorum-builder | build environment |                  NO |

## Launch the sample network

run the command below from the `examples` directory

```
docker-compose up
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

On the Docker host, a _qdata_N/_ directory for each node is created with the structure above. When the network is started, this will be mapped by the _docker-compose.yml_ file to each container's internal _/qdata/_ directory.
