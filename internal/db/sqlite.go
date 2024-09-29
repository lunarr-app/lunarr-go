package db

import (
	"os"
	"path/filepath"
	"time"

	slog "log"

	"github.com/glebarez/sqlite"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func initSQLite(dataDir string) {
	log.Info().Msg("Connecting to the SQLite database")

	sqlitePath := getSQLitePath(dataDir)

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

	// Connect to the SQLite database
	db, err := gorm.Open(sqlite.Open(sqlitePath), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to the SQLite database")
	}

	// Assign the connection to the global GormDB variable
	GormDB = db
}

// getSQLitePath returns the path to the SQLite database, or in-memory for testing
func getSQLitePath(dataDir string) string {
	if os.Getenv("TEST_ENV") == "true" {
		return ":memory:"
	}
	return filepath.Join(dataDir, "sqlite.db")
}
