package main

import (
	"fmt"
	"log"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
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

	// Scan all movie locations if they exist
	if settings != nil {
		// Create a channel to wait for all goroutines to finish
		done := make(chan struct{})

		for _, movieLocation := range settings.MovieLocations {
			util.Logger.Info().Str("location", movieLocation).Msg("Scanning movie location")

			// Start a goroutine to run ScanMediaDirectory in the background
			go func(location string) {
				scanner.ScanMediaDirectory(location)
				done <- struct{}{} // Signal completion of the goroutine
			}(movieLocation)
		}

		// Wait for all goroutines to finish
		for range settings.MovieLocations {
			<-done
		}
	}

	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	cfg := config.Get()
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Fatal(app.Listen(addr))
}
