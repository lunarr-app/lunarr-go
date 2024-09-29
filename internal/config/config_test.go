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
	assert.Equal(t, []string{}, cfg.AppSettings.MovieLocations, "Default movie locations should be empty")
	assert.Equal(t, []string{}, cfg.AppSettings.TVShowLocations, "Default TV show locations should be empty")
	assert.True(t, cfg.AppSettings.NewUserSignup, "Default new user signup should be true")
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
	assert.Equal(t, []string{"/mnt/test_movies"}, cfg.AppSettings.MovieLocations, "Movie locations should be loaded from test YAML")
	assert.Equal(t, []string{"/mnt/test_tvshows"}, cfg.AppSettings.TVShowLocations, "TV show locations should be loaded from test YAML")
	assert.True(t, cfg.AppSettings.NewUserSignup, "New user signup should be true")
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

	// Set environment variables for app_settings (SMTP and new user signup)
	os.Setenv("LUNARR_APPSETTINGS_EMAIL_SMTP_SERVER", "smtp.env.com")
	os.Setenv("LUNARR_APPSETTINGS_EMAIL_SMTP_PORT", "465")
	os.Setenv("LUNARR_APPSETTINGS_EMAIL_SMTP_USERNAME", "env_smtp_user")
	os.Setenv("LUNARR_APPSETTINGS_EMAIL_SMTP_PASSWORD", "env_smtp_pass")
	os.Setenv("LUNARR_APPSETTINGS_NEW_USER_SIGNUP", "false")

	// Set comma-separated values for movie and TV show locations
	os.Setenv("LUNARR_APPSETTINGS_MOVIE_LOCATIONS", "/mnt/movies1,/mnt/movies2")
	os.Setenv("LUNARR_APPSETTINGS_TV_SHOW_LOCATIONS", "/mnt/tvshows1,/mnt/tvshows2")

	defer os.Unsetenv("LUNARR_SERVER_HOST")
	defer os.Unsetenv("LUNARR_SERVER_PORT")
	defer os.Unsetenv("LUNARR_TMDB_API_KEY")
	defer os.Unsetenv("LUNARR_DATABASE_DRIVER")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_HOST")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_PORT")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_USER")
	defer os.Unsetenv("LUNARR_DATABASE_POSTGRES_DBNAME")

	// Unset environment variables for app_settings (SMTP and new user signup)
	defer os.Unsetenv("LUNARR_APPSETTINGS_EMAIL_SMTP_SERVER")
	defer os.Unsetenv("LUNARR_APPSETTINGS_EMAIL_SMTP_PORT")
	defer os.Unsetenv("LUNARR_APPSETTINGS_EMAIL_SMTP_USERNAME")
	defer os.Unsetenv("LUNARR_APPSETTINGS_EMAIL_SMTP_PASSWORD")
	defer os.Unsetenv("LUNARR_APPSETTINGS_NEW_USER_SIGNUP")

	// Unset comma-separated values for movie and TV show locations
	defer os.Unsetenv("LUNARR_APPSETTINGS_MOVIE_LOCATIONS")
	defer os.Unsetenv("LUNARR_APPSETTINGS_TV_SHOW_LOCATIONS")

	InitConfig()

	// Assert values are overridden by environment variables
	assert.Equal(t, "192.168.1.100", cfg.Server.Host, "Host should be overridden by environment variable")
	assert.Equal(t, 5050, cfg.Server.Port, "Port should be overridden by environment variable")
	assert.Equal(t, "env_api_key", cfg.TMDb.APIKey, "API key should be overridden by environment variable")
	assert.Equal(t, "postgres", cfg.Database.Driver, "Database driver should be overridden by environment variable")
	assert.Equal(t, "db.example.com", cfg.Database.Postgres.Host, "Postgres host should be overridden by environment variable")
	assert.Equal(t, 5433, cfg.Database.Postgres.Port, "Postgres port should be overridden by environment variable")
	assert.Equal(t, "postgresuser", cfg.Database.Postgres.User, "Postgres user should be overridden by environment variable")
	assert.Equal(t, "envdb", cfg.Database.Postgres.DBName, "Postgres DB name should be overridden by environment variable")

	// Assert SMTP settings are correctly overridden by environment variables
	assert.Equal(t, "smtp.env.com", cfg.AppSettings.EmailSMTP.SMTPServer, "SMTP server should be overridden by environment variable")
	assert.Equal(t, 465, cfg.AppSettings.EmailSMTP.Port, "SMTP port should be overridden by environment variable")
	assert.Equal(t, "env_smtp_user", cfg.AppSettings.EmailSMTP.Username, "SMTP username should be overridden by environment variable")
	assert.Equal(t, "env_smtp_pass", cfg.AppSettings.EmailSMTP.Password, "SMTP password should be overridden by environment variable")

	// Assert new user signup is correctly overridden
	assert.False(t, cfg.AppSettings.NewUserSignup, "New user signup should be false, overridden by environment variable")

	// Assert movie and TV show locations are correctly parsed
	assert.Equal(t, []string{"/mnt/movies1", "/mnt/movies2"}, cfg.AppSettings.MovieLocations, "Movie locations should be parsed correctly from environment variables")
	assert.Equal(t, []string{"/mnt/tvshows1", "/mnt/tvshows2"}, cfg.AppSettings.TVShowLocations, "TV show locations should be parsed correctly from environment variables")
}
