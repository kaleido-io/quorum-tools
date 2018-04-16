# Build Constellation
FROM jpmorganchase/constellation-base as builder

# Pull all binaries into a second stage deploy container
FROM ubuntu:16.04

COPY --from=builder /usr/local/src/constellation/ubuntu-16.04.deb /tmp/constellation/

RUN apt-get update && \
    apt-get install -y \
        lsb-release \
        dpkg-dev

RUN dpkg -i /tmp/constellation/ubuntu-16.04.deb; apt-get -y -f install && \
    rm /tmp/constellation/ubuntu-16.04.deb

COPY \
        ./constellation/start.sh \
    /usr/local/bin/

CMD ["/usr/local/bin/start.sh"]
