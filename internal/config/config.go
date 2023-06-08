package config

import (
	"flag"
	"os"
	"path/filepath"

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
	TMDb struct {
		APIKey string
	}
	AppDataDir string
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
		TMDb: struct {
			APIKey string
		}{
			APIKey: "", // Default empty value
		},
	}

	// Set the app data directory
	cfg.AppDataDir = getAppDataDir()
}

func ParseFlags() {
	// Define the command-line flags
	serverHost := flag.String("host", cfg.Server.Host, "The hostname or IP address that the server should bind to.")
	serverPort := flag.Int("port", cfg.Server.Port, "The port number that the server should listen on.")

	flag.Parse()

	// Update the configuration values with the parsed flags
	cfg.Server.Host = *serverHost
	cfg.Server.Port = *serverPort

	// Log information
	util.Logger.Info().Msgf("Server port: %d", *serverPort)
	util.Logger.Info().Msgf("Server bind IP address: %s", *serverHost)
}

func Get() *Config {
	return cfg
}

func getAppDataDir() string {
	dataDir, err := os.UserConfigDir()
	if err != nil {
		util.Logger.Error().Msgf("Failed to get user configuration directory: %v", err)
		return ""
	}

	appDir := filepath.Join(dataDir, "Lunarr")
	if err := os.MkdirAll(appDir, 0700); err != nil {
		util.Logger.Fatal().Msgf("Failed to create app directory: %v", err)
	}

	return appDir
}
