package db

import (
	"fmt"
	"os"
	"time"

	slog "log"

	"github.com/rs/zerolog/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func initPostgres(host string, port int, user, password, dbname string) {
	log.Info().Msg("Connecting to the Postgres database")

	// Construct the PostgreSQL DSN
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	gormLogger := logger.New(
		slog.New(os.Stdout, "\r\n", slog.LstdFlags),
		logger.Config{
			SlowThreshold:             time.Second, // Log queries slower than this threshold
			LogLevel:                  logger.Warn, // Log warnings and errors only
			IgnoreRecordNotFoundError: true,        // Ignore "record not found" errors
			ParameterizedQueries:      false,       // Don't log parameterized queries
			Colorful:                  true,        // Enable colorful output
		},
	)

	// Connect to the Postgres database
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to the Postgres database")
	}

	// Assign the connection to the global GormDB variable
	GormDB = db
}
