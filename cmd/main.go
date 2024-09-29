package main

import (
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
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

	// Get app settings from the database
	settings, err := db.GetSettings()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to get settings")
	}

	// If settings don't exist, create new settings and insert them into the database
	if settings == nil {
		log.Info().Msg("No settings found, creating new settings")
		settings, err = db.InsertSettings(&models.AppSettings{
			MovieLocations:  models.StringArray{},
			TVShowLocations: models.StringArray{},
		})
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to insert new settings")
		}

		log.Info().Msg("Created new settings")
	}

	// Scan all movie locations if they exist
	if len(settings.MovieLocations) > 0 {
		for _, movieLocation := range settings.MovieLocations {
			log.Info().Str("location", movieLocation).Msg("Scanning movie location")

			// Start a goroutine to run ScanMediaDirectory in the background
			go scanner.ScanMediaDirectory(movieLocation)
		}
	}

	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	cfg := config.Get()
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Info().Msgf("Server starting at %s", addr)

	// Improved error logging for server start
	if err := app.Listen(addr); err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}
