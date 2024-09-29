package scanner

import (
	"strconv"

	PTN "github.com/Saoneth/go-parse-torrent-name"
	"github.com/rs/zerolog/log"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
)

func processMovie(filename string, tor *PTN.TorrentInfo, path string) {
	log.Info().Str("filename", filename).Msg("Movie detected")

	// Search movies on TMDb
	movies, err := tmdb.TmdbClient.GetSearchMovies(tor.Title, map[string]string{
		"year":          strconv.Itoa(tor.Year),
		"include_adult": "true",
	})
	if err != nil {
		log.Err(err).Str("filename", filename).Msg("Failed to search movies on TMDb")
		return
	}

	if movies.TotalResults == 0 {
		log.Warn().Str("filename", filename).Msg("No matching movies found on TMDb")
		return
	}

	log.Info().Int("count", int(movies.TotalResults)).Str("filename", filename).Msg("Found matching movies on TMDb")

	// Get details for result on TMDb
	movie, err := tmdb.TmdbClient.GetMovieDetails(int(movies.Results[0].ID), nil)
	if err != nil {
		log.Err(err).Str("filename", filename).Msg("Failed to search movies on TMDb")
		return
	}

	// Add movie to the database
	err = db.InsertMovie(movie, path)
	if err != nil {
		log.Err(err).Str("filename", filename).Msg("Failed to insert movie into MongoDB")
		return
	}

	log.Info().Msgf("Movie inserted successfully: %s", movie.Title)
}
