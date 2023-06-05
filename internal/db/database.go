package db

import (
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDatabase() {
	util.Logger.Info().Msg("Connecting to the SQLite database")

	// Connect to the SQLite database
	db, err := gorm.Open(sqlite.Open(config.Get().Database.URI), &gorm.Config{})
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to connect to the SQLite database")
	}

	// Set the database connection in the DB variable
	DB = db

	// AutoMigrate the tables
	MigrateTables()

	util.Logger.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := DB.AutoMigrate(
		&models.UserAccount{},
		&models.MovieWithFiles{},
	)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}
