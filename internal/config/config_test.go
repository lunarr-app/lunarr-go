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

func TestGetAppDataDir(t *testing.T) {
	// Retrieve the app data directory
	appDataDir := getAppDataDir()

	// Check that the directory path is not empty
	assert.NotEmpty(t, appDataDir)

	// Check if the directory path contains the keyword "Lunarr"
	assert.Contains(t, appDataDir, "Lunarr")
}
