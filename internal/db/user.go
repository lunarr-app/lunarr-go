package db

import (
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

// CountUsers counts the number of users in the database.
func CountUsers() (int64, error) {
	var count int64
	err := GormDB.Model(&models.UserAccounts{}).Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}

// InsertUser inserts a new user into the users table
func InsertUser(user *models.UserAccounts) error {
	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user.Password = string(hashedPassword)

	err = GormDB.Create(user).Error
	if err != nil {
		log.Error().Err(err).Msg("Failed to insert user into database")
		return err
	}

	return nil
}

// UpdateUser updates an existing user in the users table
func UpdateUser(username string, updates map[string]interface{}) error {
	err := GormDB.Model(&models.UserAccounts{}).Where("username = ?", username).Updates(updates).Error
	if err != nil {
		log.Error().Err(err).Msg("Failed to update user in database")
		return err
	}

	return nil
}

// FindUserByUsername finds a user in the users table by username
func FindUserByUsername(username string) (*models.UserAccounts, error) {
	var user models.UserAccounts
	err := GormDB.Select("displayname, username, email, sex, role, api_key, created_at, updated_at, last_seen_at, current_status").
		Where("username = ?", username).
		First(&user).Error
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// FindUserByEmailOrUsername finds a user in the users table by email or username
func FindUserByEmailOrUsername(email string, username string) (*models.UserAccounts, error) {
	var user models.UserAccounts
	err := GormDB.Select("displayname, username, email, sex, role, api_key, created_at, updated_at, last_seen_at, current_status").
		Where("email = ? OR username = ?", email, username).
		First(&user).Error
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// GetUserByAPIKey returns a user from the users table by API key
func GetUserByAPIKey(apiKey string) (*models.UserAccounts, error) {
	var user models.UserAccounts
	err := GormDB.Select("displayname, username, email, sex, role, api_key, created_at, updated_at, last_seen_at, current_status").
		Where("api_key = ?", apiKey).
		First(&user).Error
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// FindAllUsers retrieves all users from the users table
func FindAllUsers() ([]models.UserAccounts, error) {
	var users []models.UserAccounts
	err := GormDB.Select("displayname, username, email, sex, role, api_key, created_at, updated_at, last_seen_at, current_status").
		Find(&users).Error
	if err != nil {
		return nil, err
	}

	return users, nil
}

// VerifyUserPassword verifies the password for a given username
func VerifyUserPassword(username, password string) bool {
	var user models.UserAccounts
	err := GormDB.Select("password").
		Where("username = ?", username).
		First(&user).Error
	if err != nil {
		return false
	}

	return bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) == nil
}
