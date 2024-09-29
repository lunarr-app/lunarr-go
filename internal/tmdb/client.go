package tmdb

import (
	tmdb "github.com/cyruzin/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/rs/zerolog/log"
)

var TmdbClient *tmdb.Client

func InitTMDBClient() {
	log.Info().Msg("Initializing TMDB client...")
	tmdbConfig := config.Get().TMDb

	var client *tmdb.Client
	var err error

	if tmdbConfig.APIKey != "" {
		client, err = tmdb.Init(tmdbConfig.APIKey)
		log.Info().Msg("Using TMDb API key for authentication.")
	} else if tmdbConfig.AccessToken != "" {
		client, err = tmdb.InitV4(tmdbConfig.AccessToken)
		log.Info().Msg("Using TMDb access token for authentication.")
	} else {
		log.Fatal().Msg("No TMDb API key or access token found in the configuration.")
	}

	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize TMDB client")
	}

	TmdbClient = client
	log.Info().Msg("TMDB client initialized successfully")
}
