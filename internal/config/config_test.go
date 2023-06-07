package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseFlags(t *testing.T) {
	// Set up the command-line arguments
	os.Args = []string{"test", "-host", "example.com", "-port", "8080"}

	// Parse the flags
	InitConfig()
	ParseFlags()

	// Check that the values have been updated
	cfg := Get()
	assert.Equal(t, "example.com", cfg.Server.Host)
	assert.Equal(t, 8080, cfg.Server.Port)
}

func TestGetSQLitePath(t *testing.T) {
	// Retrieve the SQLite path
	dbPath := getSQLitePath()

	// Check that the path is not empty and matches the expected format
	assert.NotEmpty(t, dbPath)
	assert.Contains(t, dbPath, "sqlite.db")
}
