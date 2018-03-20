SHELL := /bin/bash

.PHONY: all docker clean

DOCKER_NS = jpmorganchase
IMAGES = quorum-builder quorum constellation
GOBIN = $(shell pwd)/../quorum/build/bin
GO ?= latest

# base constellation image takes a long time to build, only build when necessary
LATEST = $(shell docker images jpmorganchase/constellation  | awk '{ print $$2 }' | grep latest)
EXISTS = $(findstring "latest", $(LATEST))

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

docker-geth: docker-builder
	@echo "Building docker image for geth"
	# build geth and bootnode commands
	docker run -v $(abspath ../quorum):/work $(DOCKER_NS)/quorum-builder make all
	# build the "quorum" docker image
	docker build -t $(DOCKER_NS)/quorum -f geth/Dockerfile ..

LATEST = $(shell docker images $(DOCKER_NS)/constellation | awk '{ print $$2 }' | grep latest)
docker-constellation: docker-builder
	@echo "Building docker image for constellation"
	# build the "constellation" docker image
ifneq ($(LATEST),latest)
	@echo "Building docker image for constellation base"
	docker build -t $(DOCKER_NS)/constellation -f ../constellation/build-ubuntu.dockerfile --build-arg DISTRO_VERSION=16.04 ../constellation
else
	@echo "Docker image for constellation base already exists"
endif

	# build the "constellation" docker image
	@echo "Building docker image for constellation-test"
	docker build -t $(DOCKER_NS)/constellation-test -f constellation/Dockerfile .

docker: docker-geth docker-constellation
