# Build Geth in a stock Go builder container
FROM golang:1.9-alpine as builder

RUN apk add --no-cache make gcc musl-dev linux-headers

ADD ./istanbul-tools /src/github.com/getamis/istanbul-tools
ENV GOPATH=/
RUN cd /src/github.com/getamis/istanbul-tools && make

# Pull Geth into a second stage deploy alpine container
FROM alpine:latest

RUN apk add --no-cache ca-certificates
COPY --from=builder /src/github.com/getamis/istanbul-tools/build/bin/istanbul /usr/local/bin/
