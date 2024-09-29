package main

import (
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/scanner"
	"github.com/lunarr-app/lunarr-go/internal/server"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
)

func main() {
	// Set up zerolog for pretty console output
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.DateTime})

	// Set log level to info
	zerolog.SetGlobalLevel(zerolog.InfoLevel)

	// Initialize the configuration
	config.InitConfig()

	// Initialize the database
	db.InitDatabase()

	// Initialize the TMDB client
	tmdb.InitTMDBClient()

	// Get app settings from the configuration
	cfg := config.Get()

	// Scan all movie locations if they exist
	if len(cfg.AppSettings.MovieLocations) > 0 {
		for _, movieLocation := range cfg.AppSettings.MovieLocations {
			log.Info().Str("location", movieLocation).Msg("Scanning movie location")

			// Start a goroutine to run ScanMediaDirectory in the background
			go scanner.ScanMediaDirectory(movieLocation)
		}
	}

	// Scan all TV show locations if they exist
	if len(cfg.AppSettings.TVShowLocations) > 0 {
		for _, tvShowLocation := range cfg.AppSettings.TVShowLocations {
			log.Info().Str("location", tvShowLocation).Msg("Scanning TV show location")

			// Start a goroutine to run ScanMediaDirectory in the background
			go scanner.ScanMediaDirectory(tvShowLocation)
		}
	}

	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Info().Msgf("Server starting at %s", addr)

	// Improved error logging for server start
	if err := app.Listen(addr); err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}
