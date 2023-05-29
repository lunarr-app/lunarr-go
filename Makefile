# Go parameters
GOCMD = go
GOBUILD = $(GOCMD) build
GOCLEAN = $(GOCMD) clean
GOTEST = $(GOCMD) test
GOGET = $(GOCMD) get

# Name of your binary
BINARY_NAME = lunarr-go

# Build the binary
build:
	$(GOBUILD) -ldflags "-s -w" -o $(BINARY_NAME) cmd/main.go

# Clean build files
clean:
	$(GOCLEAN)
	rm -f $(BINARY_NAME)

# Run tests
test:
	$(GOTEST) -v ./...

# Default target
default: build

.PHONY: build clean test
