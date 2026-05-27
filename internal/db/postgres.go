package db

import (
	"database/sql"
	"fmt"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/lunarr-app/lunarr-go/internal/ent"
	"github.com/rs/zerolog/log"
)

func initPostgres(host string, port int, user, password, dbname string) {
	log.Info().Msg("Connecting to the Postgres database")

	// Construct the PostgreSQL DSN
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to the Postgres database")
	}

	EntClient = ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, sqlDB)))
}
