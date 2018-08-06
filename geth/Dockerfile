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
        solc \
        curl

# Install Node.js and git, as well as dev tools to build binary NPMs
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash - \
    && apt-get install -y nodejs git make g++ \
    && npm install -g npm \
    && rm -rf /var/lib/apt/lists/*

COPY \
        ./quorum/build/bin/geth \
        ./quorum/build/bin/bootnode \
        ./quorum-tools/geth/start.sh \
    /usr/local/bin/

COPY \
        ./photic-eth-boot/boot/package.json \
        ./photic-eth-boot/boot/index.js \
    /usr/local/src/

COPY \
        ./photic-eth-boot/boot/lib \
    /usr/local/src/lib

RUN cd /usr/local/src && npm install

CMD ["/usr/local/bin/start.sh"]
