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
	testUser := models.UserAccount{
		Displayname:   "Test User",
		Username:      "testuser",
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

	// Retrieve the test user from the database
	retrievedUser, err := FindUserByUsername(testUser.Username)
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, retrievedUser.Displayname)
	assert.Equal(t, testUser.Username, retrievedUser.Username)
	assert.Empty(t, retrievedUser.Password)
	assert.Equal(t, testUser.Sex, retrievedUser.Sex)
	assert.Equal(t, testUser.Role, retrievedUser.Role)
	assert.Equal(t, testUser.APIKey, retrievedUser.APIKey)
	assert.WithinDuration(t, testUser.CreatedAt, retrievedUser.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, retrievedUser.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, retrievedUser.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, retrievedUser.CurrentStatus)

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

	// Clean up the test user from the database
	err = DB.Delete(&testUser).Error
	assert.NoError(t, err)
}
