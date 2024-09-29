package db

import (
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/rs/zerolog/log"

	"gorm.io/gorm"
)

var GormDB *gorm.DB

func InitDatabase() {
	cfg := config.Get()

	switch cfg.Database.Driver {
	case "sqlite":
		initSQLite(cfg.AppDataDir)
	case "postgres":
		initPostgres(cfg.Database.Postgres.Host, cfg.Database.Postgres.Port, cfg.Database.Postgres.User, cfg.Database.Postgres.Password, cfg.Database.Postgres.DBName)
	default:
		log.Fatal().Msg("Unsupported database driver")
	}

	// Migrate database tables
	MigrateTables()

	log.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := GormDB.AutoMigrate(
		// Lunarr models
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
