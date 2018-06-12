# Build Constellation
FROM jpmorganchase/constellation-base as builder

# Pull all binaries into a second stage deploy container
FROM ubuntu:16.04

COPY --from=builder /usr/local/src/constellation/ubuntu-16.04.deb /tmp/constellation/

RUN apt-get update && \
    apt-get install -y \
        lsb-release \
        dpkg-dev \
        curl

RUN dpkg -i /tmp/constellation/ubuntu-16.04.deb; apt-get -y -f install && \
    rm /tmp/constellation/ubuntu-16.04.deb

# Install Node.js and git, as well as dev tools to build binary NPMs
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash - \
    && apt-get install -y nodejs git make g++ \
    && npm install -g npm \
    && rm -rf /var/lib/apt/lists/*

COPY \
        ./quorum-tools/constellation/start.sh \
    /usr/local/bin/

COPY \
        ./quorum-tools/boot/package.json \
        ./quorum-tools/boot/index.js \
    /usr/local/src/

COPY \
        ./quorum-tools/boot/lib \
    /usr/local/src/lib

RUN cd /usr/local/src && npm install

CMD ["/usr/local/bin/start.sh"]
