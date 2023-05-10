package config

import (
	"flag"

	"lunarr/internal/logger"
)

var (
	cfg *Config
)

type Config struct {
	Server struct {
		Host string
		Port int
	}
	Database struct {
		URI string
	}
}

func init() {
	cfg = &Config{
		Server: struct {
			Host string
			Port int
		}{
			Host: "127.0.0.1",
			Port: 3000,
		},
		Database: struct {
			URI string
		}{
			URI: "mongodb://127.0.0.1:27017/lunarr",
		},
	}

	serverHost := flag.String("host", cfg.Server.Host, "The hostname or IP address that the server should bind to.")
	serverPort := flag.Int("port", cfg.Server.Port, "The port number that the server should listen on.")
	dbURI := flag.String("database-uri", cfg.Database.URI, "The URI of the MongoDB database to connect to.")

	flag.Parse()

	cfg.Server.Host = *serverHost
	cfg.Server.Port = *serverPort
	cfg.Database.URI = *dbURI

	// Log information
	logger.Log.Info().Msgf("Server port: %d", *serverPort)
	logger.Log.Info().Msgf("Server bind IP address: %s", *serverHost)
	logger.Log.Info().Msgf("MongoDB database URI: %s", *dbURI)
}

func Get() *Config {
	return cfg
}
