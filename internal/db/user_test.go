package db

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func TestUserGORM(t *testing.T) {
	// Initialize the database
	config.InitConfig()
	InitDatabase()

	// Initialize a new test user
	testUser := models.UserAccounts{
		Displayname:   "Test User",
		Username:      "testuser",
		Email:         "test@example.com",
		Password:      "testpassword",
		Sex:           "male",
		Role:          models.UserRole("subscriber"),
		APIKey:        "testapikey",
		LastSeenAt:    time.Now().UTC(),
		CurrentStatus: "active",
	}

	// Insert the test user into the database
	err := InsertUser(&testUser)
	assert.NoError(t, err)

	// Retrieve the test user by username from the database
	retrievedUserByUsername, err := FindUserByUsername(testUser.Username)
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, retrievedUserByUsername.Displayname)
	assert.Equal(t, testUser.Username, retrievedUserByUsername.Username)
	assert.Equal(t, testUser.Email, retrievedUserByUsername.Email)
	assert.Empty(t, retrievedUserByUsername.Password)
	assert.Equal(t, testUser.Sex, retrievedUserByUsername.Sex)
	assert.Equal(t, testUser.Role, retrievedUserByUsername.Role)
	assert.Equal(t, testUser.APIKey, retrievedUserByUsername.APIKey)
	assert.WithinDuration(t, testUser.CreatedAt, retrievedUserByUsername.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, retrievedUserByUsername.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, retrievedUserByUsername.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, retrievedUserByUsername.CurrentStatus)

	// Retrieve the test user by email from the database
	retrievedUserByEmail, err := FindUserByEmailOrUsername(testUser.Email, "")
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, retrievedUserByEmail.Displayname)
	assert.Equal(t, testUser.Username, retrievedUserByEmail.Username)
	assert.Equal(t, testUser.Email, retrievedUserByEmail.Email)
	assert.Empty(t, retrievedUserByEmail.Password)
	assert.Equal(t, testUser.Sex, retrievedUserByEmail.Sex)
	assert.Equal(t, testUser.Role, retrievedUserByEmail.Role)
	assert.Equal(t, testUser.APIKey, retrievedUserByEmail.APIKey)
	assert.WithinDuration(t, testUser.CreatedAt, retrievedUserByEmail.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, retrievedUserByEmail.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, retrievedUserByEmail.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, retrievedUserByEmail.CurrentStatus)

	// Update the test user in the database
	updates := map[string]interface{}{
		"sex":  "female",
		"role": models.UserRole("admin"),
	}
	err = UpdateUser(testUser.Username, updates)
	assert.NoError(t, err)

	// Retrieve the updated test user from the database
	updatedUser, err := FindUserByUsername(testUser.Username)
	assert.NoError(t, err)
	assert.Equal(t, "female", updatedUser.Sex)
	assert.Equal(t, models.UserRole("admin"), updatedUser.Role)

	// Test finding a user by API key
	foundUser, err := GetUserByAPIKey(testUser.APIKey)
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, foundUser.Displayname)
	assert.Equal(t, testUser.Username, foundUser.Username)
	assert.Empty(t, foundUser.Password)
	assert.Equal(t, updatedUser.Sex, foundUser.Sex)
	assert.Equal(t, updatedUser.Role, foundUser.Role)
	assert.WithinDuration(t, testUser.CreatedAt, foundUser.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, foundUser.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, foundUser.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, foundUser.CurrentStatus)

	// Verify the user's password
	validPassword := "testpassword"
	invalidPassword := "wrongpassword"

	assert.True(t, VerifyUserPassword(testUser.Username, validPassword))
	assert.False(t, VerifyUserPassword(testUser.Username, invalidPassword))

	// Clean up the test user from the database
	err = GormDB.Delete(&testUser).Error
	assert.NoError(t, err)
}
