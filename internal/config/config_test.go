package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInitConfigDefaults(t *testing.T) {
	os.Setenv("LUNARR_YAML_PATH", "testdata/nonexistent.yml")
	defer os.Unsetenv("LUNARR_YAML_PATH")

	InitConfig()

	assert.Equal(t, "127.0.0.1", cfg.Server.Host, "Default host should be 127.0.0.1")
	assert.Equal(t, 8484, cfg.Server.Port, "Default port should be 8484")
	assert.Empty(t, cfg.TMDb.APIKey, "Default TMDb API key should be empty")
	assert.NotEmpty(t, cfg.AppDataDir, "Default app data directory should not be empty")
	assert.Equal(t, "sqlite", cfg.Database.Driver, "Default database driver should be sqlite")
}

func TestConfigFromYAML(t *testing.T) {
	os.Setenv("LUNARR_YAML_PATH", "testdata/lunarr_test.yml")
	defer os.Unsetenv("LUNARR_YAML_PATH")

	InitConfig()

	assert.Equal(t, "0.0.0.0", cfg.Server.Host, "Host should be loaded from test YAML")
	assert.Equal(t, 9090, cfg.Server.Port, "Port should be loaded from test YAML")
	assert.Equal(t, "dummy_api_key", cfg.TMDb.APIKey, "API key should be loaded from test YAML")
	assert.Equal(t, "/tmp/lunarr_test_data", cfg.AppDataDir, "App data directory should be loaded from test YAML")
	assert.Equal(t, "postgres", cfg.Database.Driver, "Database driver should be loaded from test YAML")
	assert.Equal(t, "testuser", cfg.Database.Postgres.User, "Postgres user should be loaded from test YAML")
	assert.Equal(t, "testpassword", cfg.Database.Postgres.Password, "Postgres password should be loaded from test YAML")
	assert.Equal(t, "testdb", cfg.Database.Postgres.DBName, "Postgres DB name should be loaded from test YAML")
}

func TestConfigWithEnvVars(t *testing.T) {
	os.Setenv("LUNARR_SERVER_HOST", "192.168.1.100")
	os.Setenv("LUNARR_SERVER_PORT", "5050")
	os.Setenv("LUNARR_TMDB_API_KEY", "env_api_key")
	os.Setenv("LUNARR_DATABASE_DRIVER", "postgres")
	os.Setenv("LUNARR_DATABASE_POSTGRES_HOST", "db.example.com")
	os.Setenv("LUNARR_DATABASE_POSTGRES_PORT", "5433")
	os.Setenv("LUNARR_DATABASE_POSTGRES_USER", "postgresuser")
	os.Setenv("LUNARR_DATABASE_POSTGRES_DBNAME", "envdb")
	defer os.Unsetenv("LUNARR_SERVER_HOST")
	defer os.Unsetenv("LUNARR_SERVER_PORT")
	defer os.Unsetenv("LUNARR_TMDB_API_KEY")
	defer os.Unsetenv("LUNARR_DATABASE_DRIVER")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_HOST")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_PORT")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_USER")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_DBNAME")

	InitConfig()

	assert.Equal(t, "192.168.1.100", cfg.Server.Host, "Host should be overridden by environment variable")
	assert.Equal(t, 5050, cfg.Server.Port, "Port should be overridden by environment variable")
	assert.Equal(t, "env_api_key", cfg.TMDb.APIKey, "API key should be overridden by environment variable")
	assert.Equal(t, "postgres", cfg.Database.Driver, "Database driver should be overridden by environment variable")
	assert.Equal(t, "db.example.com", cfg.Database.Postgres.Host, "Postgres host should be overridden by environment variable")
	assert.Equal(t, 5433, cfg.Database.Postgres.Port, "Postgres port should be overridden by environment variable")
	assert.Equal(t, "postgresuser", cfg.Database.Postgres.User, "Postgres user should be overridden by environment variable")
	assert.Equal(t, "envdb", cfg.Database.Postgres.DBName, "Postgres DB name should be overridden by environment variable")
}
