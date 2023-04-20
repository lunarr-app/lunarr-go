package common

import (
	"flag"
	"os"
	"time"

	"github.com/rs/zerolog"
)

// CLI arguments configuration struct
type ArgsConfig struct {
	Port     int
	Bind     string
	Database string
}

var Config ArgsConfig
var Logger zerolog.Logger

func init() {
	// Set up logger
	output := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.DateTime}
	Logger = zerolog.New(output).With().Timestamp().Logger()

	// Parse CLI arguments
	port := flag.Int("port", 3000, "Server port")
	bind := flag.String("bind", "127.0.0.1", "Server IP address to bind to")
	database := flag.String("database", "mongodb://127.0.0.1:27017/lunarr", "MongoDB URI")
	flag.Parse()

	// Store parsed configuration in package-level variable
	Config = ArgsConfig{
		Port:     *port,
		Bind:     *bind,
		Database: *database,
	}

	// Log information
	Logger.Info().Msgf("Server port: %d", Config.Port)
	Logger.Info().Msgf("Server bind IP address: %s", Config.Bind)
	Logger.Info().Msgf("MongoDB database URI: %s", Config.Database)
}
