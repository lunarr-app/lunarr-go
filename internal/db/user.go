package db

import (
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// CountUsers counts the number of users in the database.
func CountUsers() (int64, error) {
	var count int64
	err := DB.Model(&models.UserAccount{}).Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}

// InsertUser inserts a new user into the users table
func InsertUser(user *models.UserAccount) error {
	err := DB.Create(user).Error
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to insert user into database")
		return err
	}

	return nil
}

// UpdateUser updates an existing user in the users table
func UpdateUser(username string, updates map[string]interface{}) error {
	err := DB.Model(&models.UserAccount{}).Where("username = ?", username).Updates(updates).Error
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to update user in database")
		return err
	}

	return nil
}

// FindUserByUsername finds a user in the users table by username
func FindUserByUsername(username string) (*models.UserAccount, error) {
	var user models.UserAccount
	err := DB.Where("username = ?", username).First(&user).Error
	if err != nil {
		util.Logger.Error().Err(err).Msgf("Failed to find user %s in database", username)
		return nil, err
	}

	return &user, nil
}

// GetUserByAPIKey returns a user from the users table by API key
func GetUserByAPIKey(apiKey string) (*models.UserAccount, error) {
	var user models.UserAccount
	err := DB.Where("api_key = ?", apiKey).Select("password").First(&user).Error
	if err != nil {
		return nil, err
	}

	return &user, nil
}
