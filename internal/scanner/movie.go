package scanner

import (
	"strconv"

	PTN "github.com/middelink/go-parse-torrent-name"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func processMovie(filename string, tor *PTN.TorrentInfo, path string) {
	util.Logger.Info().Str("filename", filename).Msg("Movie detected")

	// Search movies on TMDb
	movies, err := tmdb.TmdbClient.GetSearchMovies(tor.Title, map[string]string{
		"year":          strconv.Itoa(tor.Year),
		"include_adult": "true",
	})
	if err != nil {
		util.Logger.Err(err).Str("filename", filename).Msg("Failed to search movies on TMDb")
		return
	}

	if movies.TotalResults == 0 {
		util.Logger.Warn().Str("filename", filename).Msg("No matching movies found on TMDb")
		return
	}

	util.Logger.Info().Int("count", int(movies.TotalResults)).Str("filename", filename).Msg("Found matching movies on TMDb")

	// Get details for result on TMDb
	movie, err := tmdb.TmdbClient.GetMovieDetails(int(movies.Results[0].ID), nil)
	if err != nil {
		util.Logger.Err(err).Str("filename", filename).Msg("Failed to search movies on TMDb")
		return
	}

	// Add movie to the database
	err = db.InsertMovie(movie, path)
	if err != nil {
		util.Logger.Err(err).Str("filename", filename).Msg("Failed to insert movie into MongoDB")
		return
	}

	util.Logger.Info().Msgf("Movie inserted successfully: %s", movie.Title)
}
