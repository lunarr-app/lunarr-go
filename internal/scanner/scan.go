package scanner

import (
	"io/fs"
	"path/filepath"
	"strconv"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
	PTN "github.com/middelink/go-parse-torrent-name"
)

func ScanMediaDirectory(directory string) {
	err := filepath.WalkDir(directory, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			util.Logger.Error().Err(err).Str("path", path).Msg("Error accessing path")
			return nil
		}

		// Skip directories
		if d.IsDir() {
			return nil
		}

		if !IsValidVideoFile(path) {
			util.Logger.Warn().Str("path", path).Msg("Invalid video file, skipping")
			return nil
		}

		if db.CheckMovieExists(path) {
			util.Logger.Info().Str("path", path).Msg("Movie already exists in the database")
			return nil
		}

		// Parse filename
		tor, err := PTN.Parse(path)
		if err != nil {
			util.Logger.Err(err).Str("path", path).Msg("Filename parse error")
			return nil
		}

		// Check if the file is a movie by comparing the year, season, and episode
		// First-ever movie was created in 1888, so we consider it a movie if the year is greater than or equal to 1888
		isMovie := tor.Year >= 1888 && tor.Season == 0 && tor.Episode == 0
		if !isMovie {
			util.Logger.Info().Str("path", path).Msg("Not a movie, skipping")
			return nil
		}

		util.Logger.Info().Str("path", path).Msg("Movie detected")

		// Search movies on TMDb
		movies, err := tmdb.TmdbClient.GetSearchMovies(tor.Title, map[string]string{
			"year":          strconv.Itoa(tor.Year),
			"include_adult": "true",
		})
		if err != nil {
			util.Logger.Err(err).Str("path", path).Msg("Failed to search movies on TMDb")
			return nil
		}

		if movies.TotalResults == 0 {
			util.Logger.Info().Str("path", path).Msg("No matching movies found on TMDb")
			return nil
		}

		util.Logger.Info().Int("count", int(movies.TotalResults)).Str("path", path).Msg("Found matching movies on TMDb")

		// Get details for result on TMDb
		movie, err := tmdb.TmdbClient.GetMovieDetails(int(movies.Results[0].ID), map[string]string{
			"append_to_response": "keywords,alternative_titles,changes,credits,images,keywords,lists,releases,reviews,similar,translations,videos",
		})
		if err != nil {
			util.Logger.Err(err).Str("path", path).Msg("Failed to search movies on TMDb")
			return nil
		}

		// Add movie to the database
		err = db.InsertMovie(movie, path)
		if err != nil {
			util.Logger.Err(err).Str("path", path).Msg("Failed to insert movie into MongoDB")
			return nil
		}

		util.Logger.Info().Msgf("Movie inserted successfully: %s", movie.Title)
		return nil
	})

	if err != nil {
		util.Logger.Err(err).Msg("Failed to scan media directory")
	}
}
