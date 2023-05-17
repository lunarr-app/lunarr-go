package scanner

import (
	tmdb "github.com/lunarr-app/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

var TmdbClient *tmdb.Client

// IMPORTANT: The following access token is for production usage only and should NOT be shared or used in third-party repositories.
const accessToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhMGVlMjVjNzg4OGQ3MGU4NTg3ODU5YzUwNjBhZmYwMCIsInN1YiI6IjVlMzVhMzdmNzZlZWNmMDAxNThmNjliZSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ._Ati2D39oQJy6sSPwF4-1ooinjEjvuqqMbhXkPqDA6I"

func InitTMDBClient() {
	util.Logger.Info().Msg("Initializing TMDB client...")
	client, err := tmdb.InitWithAccessToken(accessToken)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to initialize TMDB client")
	}

	TmdbClient = client
	util.Logger.Info().Msg("TMDB client initialized successfully")
}
