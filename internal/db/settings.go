package db

import (
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
	"gorm.io/gorm"
)

// InsertSettings inserts the application settings into the settings table
func InsertSettings(settings *models.AppSettings) error {
	err := DB.Create(settings).Error
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to insert settings into database")
		return err
	}
	return nil
}

// UpdateSettings updates the application settings in the settings table
func UpdateSettings(settings *models.AppSettings) error {
	err := DB.Save(settings).Error
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to update settings in database")
		return err
	}
	return nil
}

// GetSettings retrieves the application settings from the settings table
func GetSettings() (*models.AppSettings, error) {
	var settings models.AppSettings
	err := DB.First(&settings).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		util.Logger.Error().Err(err).Msg("Failed to retrieve settings from database")
		return nil, err
	}
	return &settings, nil
}
