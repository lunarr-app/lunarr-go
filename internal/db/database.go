package db

import (
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"

	"gorm.io/gorm"
)

var GormDB *gorm.DB

func InitDatabase() {
	// Get the app data directory from the configuration
	appDataDir := config.Get().AppDataDir

	initSQLite(appDataDir)
	MigrateTables()

	util.Logger.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := GormDB.AutoMigrate(
		// Lunarr models
		&models.AppSettings{},
		&models.UserAccounts{},
		&models.MovieWithFiles{},

		// TMDb models
		&models.TMDbBelongsToCollection{},
		&models.TMDbGenre{},
		&models.TMDbSpokenLanguage{},
	)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}
