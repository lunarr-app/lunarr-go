package main

import (
	"fmt"
	"log"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/scanner"
	"github.com/lunarr-app/lunarr-go/internal/server"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func main() {
	// Initialize logger instance
	util.InitLogger()

	// Parse command-line flags
	config.InitConfig()
	config.ParseFlags()

	// Initialize the database
	db.InitDatabase()

	// Initialize the TMDB client
	tmdb.InitTMDBClient()

	// Get app settings from database
	settings, err := db.GetSettings()
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to get settings")
	}

	// If settings don't exist, create new settings and insert into the database
	if settings == nil {
		util.Logger.Info().Msg("No settings found, creating new settings")
		settings, err = db.InsertSettings(&models.AppSettings{
			MovieLocations:  models.StringArray{},
			TVShowLocations: models.StringArray{},
		})
		if err != nil {
			util.Logger.Fatal().Err(err).Msg("Failed to insert new settings")
		}

		util.Logger.Info().Msg("Created new settings")
	}

	// Scan all movie locations if they exist
	if len(settings.MovieLocations) > 0 {
		for _, movieLocation := range settings.MovieLocations {
			util.Logger.Info().Str("location", movieLocation).Msg("Scanning movie location")

			// Start a goroutine to run ScanMediaDirectory in the background
			go scanner.ScanMediaDirectory(movieLocation)
		}
	}

	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	cfg := config.Get()
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Fatal(app.Listen(addr))
}
