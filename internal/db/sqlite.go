package db

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/lunarr-app/lunarr-go/internal/util"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func initSQLite(dataDir string) {
	util.Logger.Info().Msg("Connecting to the SQLite database")

	// Set the SQLite database path
	var sqlitePath string
	if os.Getenv("TEST_ENV") == "true" {
		sqlitePath = ":memory:"
	} else {
		sqlitePath = filepath.Join(dataDir, "sqlite.db")
	}

	// Connect to the SQLite database
	db, err := gorm.Open(sqlite.Open(sqlitePath), &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold:             time.Second,
				LogLevel:                  logger.Warn,
				IgnoreRecordNotFoundError: true,
				ParameterizedQueries:      false,
				Colorful:                  true,
			},
		),
	})
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to connect to the SQLite database")
	}

	// Set the database connection in the DB variable
	GormDB = db
}
