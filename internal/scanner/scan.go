package scanner

import (
	"io/fs"
	"path/filepath"

	PTN "github.com/middelink/go-parse-torrent-name"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
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

		filename := filepath.Base(path)

		if !IsValidVideoFile(filename) {
			util.Logger.Debug().Str("filename", filename).Msg("Invalid video file, skipping")
			return nil
		}

		if db.CheckMovieExists(path) {
			util.Logger.Debug().Str("filename", filename).Msg("Movie already exists in the database")
			return nil
		}

		// Parse filename
		tor, err := PTN.Parse(filename)
		if err != nil {
			util.Logger.Err(err).Str("filename", filename).Msg("Filename parse error")
			return nil
		}

		// Check if the file is a movie by comparing the year, season, and episode
		// First-ever movie was created in 1888, so we consider it a movie if the year is greater than or equal to 1888
		isMovie := tor.Year >= 1888 && tor.Season == 0 && tor.Episode == 0
		if isMovie {
			processMovie(filename, tor, path)
		}

		return nil
	})

	if err != nil {
		util.Logger.Err(err).Msg("Failed to scan media directory")
	}
}
