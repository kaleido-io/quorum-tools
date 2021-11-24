SHELL := /bin/bash

.PHONY: docker clean

DOCKER_NS = jpmorganchase
IMAGES = quorum-builder quorum
GOBIN = $(shell pwd)/../quorum/build/bin
GO ?= latest

%-docker-clean:
	$(eval TARGET = ${patsubst %-docker-clean,%,${@}})
	-docker images -q $(DOCKER_NS)/$(TARGET) | xargs -I '{}' docker rmi -f '{}'

docker-clean: $(patsubst %,%-docker-clean, $(IMAGES))

clean: docker-clean
	rm -fr ../quorum/build/_workspace/pkg/ $(GOBIN)/*

# Docker builds
docker-builder:
	@echo "Building docker image for builder"
	docker build -t $(DOCKER_NS)/quorum-builder builder

docker-bootnode: docker-builder
	@echo "Building docker image for bootnode"
	# build geth and bootnode commands
	docker run -v $(abspath ../quorum):/work $(DOCKER_NS)/quorum-builder make all
	# build the "bootnode" docker image
	docker build -t $(DOCKER_NS)/bootnode -f bootnode/Dockerfile ..

docker-geth: docker-builder
	@echo "Building docker image for geth"
	# build geth and bootnode commands
	docker run -v $(abspath ../quorum):/work $(DOCKER_NS)/quorum-builder make all
	# build the "quorum" docker image
	docker build -t $(DOCKER_NS)/quorum -f geth/Dockerfile ..

istanbul-tools:
	@echo "Building docker image for istanbul-tools"
	docker build -t istanbul-tools -f istanbul/Dockerfile ..

docker: docker-geth istanbul-tools
