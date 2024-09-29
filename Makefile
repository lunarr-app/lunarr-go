# Go parameters
GOCMD = go
GOBUILD = $(GOCMD) build
GOCLEAN = $(GOCMD) clean
GOTEST = $(GOCMD) test
GOGET = $(GOCMD) get

# Name of binary
BINARY_NAME = lunarr-go

# Swaggo parameters
SWAGCMD = swag

# Configuration file path
CONFIG_FILE = lunarr.yml
LUNARR_YAML_PATH = $(shell pwd)/$(CONFIG_FILE)

# Build the binary
build:
	CGO_ENABLED=0 $(GOBUILD) -ldflags "-s -w" -o $(BINARY_NAME) cmd/main.go

# Generate Swagger docs
swagger:
	$(SWAGCMD) init -g internal/server/server.go

# Clean build files
clean:
	$(GOCLEAN)
	rm -f $(BINARY_NAME)

# Run tests with config
test:
	LUNARR_YAML_PATH=$(LUNARR_YAML_PATH) TEST_ENV=true $(GOTEST) -v ./...

# Lint the code
lint:
	golangci-lint run ./...

# Install dependencies
deps:
	$(GOCMD) mod tidy

# Default target
default: build

.PHONY: build clean test swagger lint deps
