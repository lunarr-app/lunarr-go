IMAGE ?= sayem314/lunarr
VERSION ?= $(shell node -p "require('./package.json').version")
PLATFORMS ?= linux/amd64,linux/arm64
BUILDER ?=

BUILDER_ARG := $(if $(BUILDER),--builder $(BUILDER),)
IMAGE_TAGS := -t $(IMAGE):latest -t $(IMAGE):$(VERSION)

.PHONY: help docker-build docker-push docker-build-push docker-run

help:
	@echo "Docker targets:"
	@echo "  make docker-build       Build local Docker image tags"
	@echo "  make docker-push        Push existing local latest/version tags"
	@echo "  make docker-build-push  Build and push multi-arch latest/version tags"
	@echo "  make docker-run         Run local lunarr container"
	@echo ""
	@echo "Variables:"
	@echo "  IMAGE=$(IMAGE)"
	@echo "  VERSION=$(VERSION)"
	@echo "  PLATFORMS=$(PLATFORMS)"
	@echo "  BUILDER=$(BUILDER)"

docker-build:
	docker build $(IMAGE_TAGS) -t lunarr:local .

docker-push:
	docker push $(IMAGE):latest
	docker push $(IMAGE):$(VERSION)

docker-build-push:
	docker buildx build $(BUILDER_ARG) --platform $(PLATFORMS) $(IMAGE_TAGS) --push .

docker-run:
	docker rm -f lunarr 2>/dev/null || true
	docker run -d \
		--name lunarr \
		--restart unless-stopped \
		-p 3000:3000 \
		--env-file /opt/lunarr/lunarr.env \
		-v /opt/lunarr/data:/data \
		lunarr:local
