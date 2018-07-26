FROM ubuntu:16.04

# Install useful tools for investigating runtime issues
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl

COPY \
        ./quorum/build/bin/bootnode \
    /usr/local/bin/
