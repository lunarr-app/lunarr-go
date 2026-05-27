package db

import (
	"context"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/ent"
	"github.com/rs/zerolog/log"
)

var EntClient *ent.Client

func InitDatabase() {
	cfg := config.Get()

	if EntClient != nil {
		_ = EntClient.Close()
	}

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
	err := EntClient.Schema.Create(context.Background())
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}

func IsNotFound(err error) bool {
	return ent.IsNotFound(err)
}
