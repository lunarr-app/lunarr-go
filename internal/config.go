package config

import (
	"flag"
	"os"

	"github.com/rs/zerolog"
)

// CLI arguments configuration struct
type ArgsConfig struct {
	Port     int
	Bind     string
	Database string
}

var Config ArgsConfig

func init() {
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

	// Use parsed configuration
	UseConfig()
}

// Use configuration struct
// func UseConfig() {
// 	log.Printf("Server port: %d\n", Config.Port)
// 	log.Printf("Server bind IP address: %s\n", Config.Bind)
// 	log.Printf("MongoDB database URI: %s\n", Config.Database)
// }

// Use configuration struct
func UseConfig() {
	// Initialize zerolog logger
	logger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})

	// Use logger to print configuration values
	logger.Info().Msgf("Server port: %d", Config.Port)
	logger.Info().Msgf("Server bind IP address: %s", Config.Bind)
	logger.Info().Msgf("MongoDB database URI: %s", Config.Database)
}
