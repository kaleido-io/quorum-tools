FROM ubuntu:16.04

# Install add-apt-repository
RUN apt-get update && \
    apt-get install -y --no-install-recommends software-properties-common && \
    add-apt-repository ppa:ethereum/ethereum && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        libdb-dev \
        libsodium-dev \
        libtinfo-dev \
        solc && \
    rm -rf /var/lib/apt/lists/*

COPY \
        ./quorum/build/bin/geth \
        ./quorum/build/bin/bootnode \
        ./quorum-tests/geth/start.sh \
    /usr/local/bin/

CMD ["/usr/local/bin/start.sh"]
