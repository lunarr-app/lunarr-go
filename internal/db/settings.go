package db

import (
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// InsertSettings inserts the application settings into the settings table
func InsertSettings(settings *models.AppSettings) (*models.AppSettings, error) {
	err := GormDB.Create(settings).Error
	if err != nil {
		log.Error().Err(err).Msg("Failed to insert settings into database")
		return nil, err
	}
	return settings, nil
}

// UpdateSettings updates the application settings in the settings table
func UpdateSettings(settings *models.AppSettings) error {
	err := GormDB.Save(settings).Error
	if err != nil {
		log.Error().Err(err).Msg("Failed to update settings in database")
		return err
	}
	return nil
}

// GetSettings retrieves the application settings from the settings table
func GetSettings() (*models.AppSettings, error) {
	var settings models.AppSettings
	err := GormDB.First(&settings).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		log.Error().Err(err).Msg("Failed to retrieve settings from database")
		return nil, err
	}
	return &settings, nil
}
