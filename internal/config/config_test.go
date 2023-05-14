package config_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/config"
)

func TestParseFlags(t *testing.T) {
	// Set up the command-line arguments
	os.Args = []string{"test", "-host", "example.com", "-port", "8080", "-database-uri", "mongodb://db.example.com/lunarr-test"}

	// Parse the flags
	config.ParseFlags()

	// Check that the values have been updated
	cfg := config.Get()
	assert.Equal(t, "example.com", cfg.Server.Host)
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "mongodb://db.example.com/lunarr-test", cfg.Database.URI)
}
