package db

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/dgraph-io/badger/v4"
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB
var BadgerDB *badger.DB

func InitDatabase() {
	util.Logger.Info().Msg("Connecting to the SQLite database")

	// Get the app data directory from the configuration
	appDataDir := config.Get().AppDataDir

	// Set the SQLite database path
	var sqlitePath string
	if os.Getenv("TEST_ENV") == "true" {
		sqlitePath = ":memory:"
	} else {
		sqlitePath = filepath.Join(appDataDir, "sqlite.db")
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
	DB = db

	// Open Badger database
	var badgerDB *badger.DB
	if os.Getenv("TEST_ENV") == "true" {
		badgerDB, err = badger.Open(badger.DefaultOptions("").WithInMemory(true))
	} else {
		badgerPath := filepath.Join(appDataDir, "badger")
		badgerDB, err = badger.Open(badger.DefaultOptions(badgerPath).WithSyncWrites(true))
	}

	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to open Badger database")
	}
	BadgerDB = badgerDB

	// AutoMigrate the tables
	MigrateTables()

	util.Logger.Info().Msg("Database initialization complete")
}

func MigrateTables() {
	err := DB.AutoMigrate(
		&models.AppSettings{},
		&models.UserAccount{},
		&models.MovieWithFiles{},
	)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to perform auto migration")
	}
}
