package scanner

import (
	"io/fs"
	"path/filepath"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// List of valid video file extensions
var videoExtensions = []string{".mp4", ".mov", ".avi", ".mkv", ".webm"}

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
			} else {
				// To-do
			}
		}

		return nil
	})

	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to scan media directory")
	}
}
