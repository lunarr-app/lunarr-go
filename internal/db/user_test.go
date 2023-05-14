package db

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.mongodb.org/mongo-driver/bson"

	"github.com/lunarr-app/lunarr-go/internal/models"
)

func TestUserMongo(t *testing.T) {
	// Initialize the database
	InitDatabase()

	// Initialize a new test user
	testUser := models.UserMongo{
		Displayname:   "Test User",
		Username:      "testuser",
		Password:      "testpassword",
		Sex:           "males",
		Role:          "subscriber",
		APIKey:        "testapikey",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		LastSeenAt:    time.Now(),
		CurrentStatus: "active",
	}

	// Insert the test user into the database
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := UsersAccounts.InsertOne(ctx, testUser)
	assert.NoError(t, err)

	// Retrieve the test user from the database
	retrievedUser, err := FindUserByUsername(testUser.Username)
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, retrievedUser.Displayname)
	assert.Equal(t, testUser.Username, retrievedUser.Username)
	assert.Equal(t, testUser.Password, retrievedUser.Password)
	assert.Equal(t, testUser.Sex, retrievedUser.Sex)
	assert.Equal(t, testUser.Role, retrievedUser.Role)
	assert.Equal(t, testUser.APIKey, retrievedUser.APIKey)
	assert.WithinDuration(t, testUser.CreatedAt, retrievedUser.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, retrievedUser.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, retrievedUser.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, retrievedUser.CurrentStatus)

	// Clean up the test user from the database
	_, err = UsersAccounts.DeleteOne(ctx, bson.M{"username": testUser.Username})
	assert.NoError(t, err)
}
