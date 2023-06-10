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

# Run tests
test:
	TEST_ENV=true $(GOTEST) -v ./...

# Default target
default: build

.PHONY: build clean test swagger
