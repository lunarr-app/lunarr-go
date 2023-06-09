package db

import (
	"github.com/dgraph-io/badger/v4"
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"

	"gorm.io/gorm"
)

var GormDB *gorm.DB
var BadgerDB *badger.DB

func InitDatabase() {
	// Get the app data directory from the configuration
	appDataDir := config.Get().AppDataDir

	initSQLite(appDataDir)
	initBadger(appDataDir)
	MigrateTables()

	util.Logger.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := GormDB.AutoMigrate(
		// Lunarr models
		&models.AppSettings{},
		&models.UserAccount{},
		&models.MovieWithFiles{},

		// TMDb models
		&models.TMdbBelongsToCollection{},
		&models.TMDbGenre{},
		&models.TMDbSpokenLanguage{},
	)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}
