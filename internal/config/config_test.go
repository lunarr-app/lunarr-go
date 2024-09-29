package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInitConfigDefaults(t *testing.T) {
	// Clear environment variables that could override defaults
	os.Unsetenv("LUNARR_SERVER_HOST")
	os.Unsetenv("LUNARR_SERVER_PORT")
	os.Unsetenv("LUNARR_TMDB_API_KEY")

	// Initialize configuration
	InitConfig()

	// Assert default values
	cfg := Get()
	assert.Equal(t, "127.0.0.1", cfg.Server.Host, "default host should be 127.0.0.1")
	assert.Equal(t, 8484, cfg.Server.Port, "default port should be 8484")
	assert.Equal(t, "", cfg.TMDb.APIKey, "default API key should be empty")
	assert.NotEmpty(t, cfg.AppDataDir, "app data directory should not be empty")
}

func TestConfigFromYAML(t *testing.T) {
	// Set up a temporary YAML config file
	yamlContent := `
server:
  host: "0.0.0.0"
  port: 9090
tmdb:
  api_key: "dummy_api_key"
app_data_dir: "/tmp/lunarr_data"
`
	tmpFile, err := os.CreateTemp("", "lunarr.yml")
	assert.NoError(t, err)
	defer os.Remove(tmpFile.Name())

	_, err = tmpFile.Write([]byte(yamlContent))
	assert.NoError(t, err)
	tmpFile.Close()

	// Use the temporary YAML file
	os.Setenv("LUNARR_YAML_PATH", tmpFile.Name())
	defer os.Unsetenv("LUNARR_YAML_PATH")

	// Initialize configuration
	InitConfig()

	// Assert values loaded from YAML
	cfg := Get()
	assert.Equal(t, "0.0.0.0", cfg.Server.Host, "host should be loaded from YAML")
	assert.Equal(t, 9090, cfg.Server.Port, "port should be loaded from YAML")
	assert.Equal(t, "dummy_api_key", cfg.TMDb.APIKey, "API key should be loaded from YAML")
	assert.Equal(t, "/tmp/lunarr_data", cfg.AppDataDir, "app data directory should be loaded from YAML")
}

func TestConfigWithEnvVars(t *testing.T) {
	// Set environment variables
	err := os.Setenv("LUNARR_SERVER_HOST", "192.168.1.100")
	assert.NoError(t, err)
	err = os.Setenv("LUNARR_SERVER_PORT", "5050")
	assert.NoError(t, err)
	err = os.Setenv("LUNARR_TMDB_API_KEY", "env_api_key")
	assert.NoError(t, err)

	defer os.Unsetenv("LUNARR_SERVER_HOST")
	defer os.Unsetenv("LUNARR_SERVER_PORT")
	defer os.Unsetenv("LUNARR_TMDB_API_KEY")

	// Add debug logs to ensure env variables are set
	t.Logf("Environment LUNARR_SERVER_HOST: %s", os.Getenv("LUNARR_SERVER_HOST"))
	t.Logf("Environment LUNARR_SERVER_PORT: %s", os.Getenv("LUNARR_SERVER_PORT"))
	t.Logf("Environment LUNARR_TMDB_API_KEY: %s", os.Getenv("LUNARR_TMDB_API_KEY"))

	// Initialize configuration
	InitConfig()

	// Assert environment variable overrides
	cfg := Get()
	assert.Equal(t, "192.168.1.100", cfg.Server.Host, "host should be overridden by environment variable")
	assert.Equal(t, 5050, cfg.Server.Port, "port should be overridden by environment variable")
	assert.Equal(t, "env_api_key", cfg.TMDb.APIKey, "API key should be overridden by environment variable")
}
