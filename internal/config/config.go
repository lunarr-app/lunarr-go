package config

import (
	"flag"

	"github.com/lunarr-app/lunarr-go/internal/util"
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
	TMDb struct {
		APIKey string
	}
}

func InitConfig() {
	// Initialize the default configuration values
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
		TMDb: struct {
			APIKey string
		}{
			APIKey: "", // Default empty value
		},
	}
}

func ParseFlags() {
	// Define the command-line flags
	serverHost := flag.String("host", cfg.Server.Host, "The hostname or IP address that the server should bind to.")
	serverPort := flag.Int("port", cfg.Server.Port, "The port number that the server should listen on.")
	dbURI := flag.String("database-uri", cfg.Database.URI, "The URI of the MongoDB database to connect to.")
	tmdbAPIKey := flag.String("tmdb-api-key", cfg.TMDb.APIKey, "The API key for TMDb")

	flag.Parse()

	// Update the configuration values with the parsed flags
	cfg.Server.Host = *serverHost
	cfg.Server.Port = *serverPort
	cfg.Database.URI = *dbURI
	cfg.TMDb.APIKey = *tmdbAPIKey

	// Log information
	util.Logger.Info().Msgf("Server port: %d", *serverPort)
	util.Logger.Info().Msgf("Server bind IP address: %s", *serverHost)
	util.Logger.Info().Msgf("MongoDB database URI: %s", *dbURI)
	if *tmdbAPIKey != "" {
		util.Logger.Info().Msgf("TMDb API key: %s", util.MaskSecret(*tmdbAPIKey))
	}
}

func Get() *Config {
	return cfg
}
