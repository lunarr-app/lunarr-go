package db

import (
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/rs/zerolog/log"

	"gorm.io/gorm"
)

var GormDB *gorm.DB

func InitDatabase() {
	// Get the app data directory from the configuration
	appDataDir := config.Get().AppDataDir

	initSQLite(appDataDir)
	MigrateTables()

	log.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := GormDB.AutoMigrate(
		// Lunarr models
		&models.AppSettings{},
		&models.UserAccounts{},
		&models.MovieWithFiles{},

		// TMDb models
		&models.TMDbGenre{},
		&models.TMDbSpokenLanguage{},
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}
