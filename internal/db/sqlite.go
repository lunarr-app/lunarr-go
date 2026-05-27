package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/lunarr-app/lunarr-go/internal/ent"
	"github.com/rs/zerolog/log"
	_ "modernc.org/sqlite"
)

func initSQLite(dataDir string) {
	log.Info().Msg("Connecting to the SQLite database")

	sqlitePath := getSQLitePath(dataDir)

	sqlDB, err := sql.Open("sqlite", sqlitePath)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to the SQLite database")
	}
	sqlDB.SetMaxOpenConns(1)
	if _, err := sqlDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
		log.Fatal().Err(err).Msg("Failed to enable SQLite foreign keys")
	}

	EntClient = ent.NewClient(ent.Driver(entsql.OpenDB(dialect.SQLite, sqlDB)))
}

// getSQLitePath returns the path to the SQLite database, or in-memory for testing
func getSQLitePath(dataDir string) string {
	if os.Getenv("TEST_ENV") == "true" || isTestProcess() {
		return fmt.Sprintf("file:lunarr-test-%d?mode=memory&cache=shared&_fk=1&_pragma=foreign_keys(1)", time.Now().UnixNano())
	}
	return filepath.Join(dataDir, "sqlite.db") + "?_fk=1&_pragma=foreign_keys(1)"
}

func isTestProcess() bool {
	return strings.HasSuffix(os.Args[0], ".test")
}
