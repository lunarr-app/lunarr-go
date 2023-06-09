package db

import (
	"testing"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestSettings(t *testing.T) {
	config.InitConfig()
	InitDatabase()

	// Create a new settings object
	settings := &models.AppSettings{
		MovieLocations:  models.StringArray{"/path/to/location 1", "/path/to/location 2"},
		TVShowLocations: models.StringArray{},
		EmailSMTP: &models.EmailSMTPSettings{
			SMTPServer: "smtp.example.com",
			Port:       587,
			Username:   "user@example.com",
			Password:   "password",
		},
	}

	// Insert settings into the database
	_, err := InsertSettings(settings)
	assert.NoError(t, err)

	// Retrieve settings from the database
	retrievedSettings, err := GetSettings()
	assert.NoError(t, err)
	assert.Equal(t, settings.MovieLocations, retrievedSettings.MovieLocations)
	assert.Equal(t, settings.TVShowLocations, retrievedSettings.TVShowLocations)
	assert.Equal(t, settings.EmailSMTP.SMTPServer, retrievedSettings.EmailSMTP.SMTPServer)
	assert.Equal(t, settings.EmailSMTP.Port, retrievedSettings.EmailSMTP.Port)
	assert.Equal(t, settings.EmailSMTP.Username, retrievedSettings.EmailSMTP.Username)
	assert.Equal(t, settings.EmailSMTP.Password, retrievedSettings.EmailSMTP.Password)

	// Update settings in the database
	settings.MovieLocations = models.StringArray{"/path/to/updated/location"}
	err = UpdateSettings(settings)
	assert.NoError(t, err)

	// Retrieve updated settings from the database
	retrievedSettings, err = GetSettings()
	assert.NoError(t, err)
	assert.Equal(t, settings.MovieLocations, retrievedSettings.MovieLocations)
	assert.Equal(t, settings.TVShowLocations, retrievedSettings.TVShowLocations)
	assert.Equal(t, settings.EmailSMTP.SMTPServer, retrievedSettings.EmailSMTP.SMTPServer)
	assert.Equal(t, settings.EmailSMTP.Port, retrievedSettings.EmailSMTP.Port)
	assert.Equal(t, settings.EmailSMTP.Username, retrievedSettings.EmailSMTP.Username)
	assert.Equal(t, settings.EmailSMTP.Password, retrievedSettings.EmailSMTP.Password)
}
