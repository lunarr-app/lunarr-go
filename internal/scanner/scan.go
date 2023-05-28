package scanner

import (
	"io/fs"
	"path/filepath"

	"github.com/lunarr-app/lunarr-go/internal/db"
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

		// Check if the file has a valid video extension
		if IsValidVideoFile(path) {
			if db.CheckMovieExists(path) {
				util.Logger.Info().Str("path", path).Msg("Movie already exists in the database")
				return nil
			}

			// Parse filename
			tor, err := PTN.Parse(path)
			if err != nil {
				util.Logger.Err(err).Msg("Filename parse error")
				return nil
			}

			// Check if the file is a movie by comparing the year, season, and episode
			// First-ever movie was created in 1888, so we consider it a movie if the year is greater than or equal to 1888
			isMovie := tor.Year >= 1888 && tor.Season == 0 && tor.Episode == 0
			if isMovie {
				// TODO: Find movies on TMDb
				// TODO: Add movie to the database
				util.Logger.Info().Str("path", path).Msg("Movie detected")
			}
		}

		return nil
	})

	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to scan media directory")
	}
}
