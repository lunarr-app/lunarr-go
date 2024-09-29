# Build stage
FROM golang:1.22-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy go.mod and go.sum files to download dependencies
COPY go.mod go.sum ./

# Download the dependencies
RUN go mod download && go mod verify

# Copy the rest of the source code
COPY . .

# Build the Go application
RUN CGO_ENABLED=0 GOOS=linux go build -o lunarr ./cmd

# Final stage
FROM alpine:latest

# Set the working directory inside the container
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/lunarr .

# Set environment variables for host and port
ENV LUNARR_SERVER_HOST="0.0.0.0"
ENV LUNARR_SERVER_PORT="8484"

# Expose the port
EXPOSE 8484

# Run the application (no command-line args needed, uses env vars)
CMD ["./lunarr"]
