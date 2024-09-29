package config

import (
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
)

func getDefaultAppDataDir() string {
	dataDir, err := os.UserConfigDir()
	if err != nil {
		log.Error().Msgf("Failed to get user configuration directory: %v", err)
		return ""
	}

	appDir := filepath.Join(dataDir, "Lunarr")
	if err := os.MkdirAll(appDir, 0700); err != nil {
		log.Fatal().Msgf("Failed to create app directory: %v", err)
	}

	return appDir
}
