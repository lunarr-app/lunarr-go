package scanner

import (
	"io/fs"
	"path/filepath"

	PTN "github.com/Saoneth/go-parse-torrent-name"
	"github.com/rs/zerolog/log"

	"github.com/lunarr-app/lunarr-go/internal/db"
)

func ScanMediaDirectory(directory string) {
	err := filepath.WalkDir(directory, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Error().Err(err).Str("path", path).Msg("Error accessing path")
			return nil
		}

		// Skip directories
		if d.IsDir() {
			return nil
		}

		filename := filepath.Base(path)

		if !IsValidVideoFile(filename) {
			log.Debug().Str("filename", filename).Msg("Invalid video file, skipping")
			return nil
		}

		if db.CheckMovieExists(path) {
			log.Debug().Str("filename", filename).Msg("Movie already exists in the database")
			return nil
		}

		// Parse filename
		tor, err := PTN.Parse(filename)
		if err != nil {
			log.Err(err).Str("filename", filename).Msg("Filename parse error")
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
		log.Err(err).Msg("Failed to scan media directory")
	}
}
