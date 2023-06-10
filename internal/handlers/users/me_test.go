package users

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestGetMeHandler(t *testing.T) {
	config.InitConfig()
	db.InitDatabase()

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
	err := db.InsertUser(&testUser)
	assert.NoError(t, err)

	// Create a new Fiber app
	app := fiber.New()

	// Define the test route
	app.Get("/api/users/me", GetMeHandler)

	// Mock the request
	req := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.Header.Set("x-api-key", "testapikey")
	res, err := app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Decode the response body
	var retrievedUser models.UserAccounts
	err = json.NewDecoder(res.Body).Decode(&retrievedUser)
	assert.NoError(t, err)

	// Verify the response body contains the expected user data
	assert.NoError(t, err)
	assert.Equal(t, testUser.Displayname, retrievedUser.Displayname)
	assert.Equal(t, testUser.Username, retrievedUser.Username)
	assert.Equal(t, testUser.Email, retrievedUser.Email)
	assert.Empty(t, retrievedUser.Password)
	assert.Equal(t, testUser.Sex, retrievedUser.Sex)
	assert.Equal(t, testUser.Role, retrievedUser.Role)
	assert.Equal(t, testUser.APIKey, retrievedUser.APIKey)
	assert.WithinDuration(t, testUser.CreatedAt, retrievedUser.CreatedAt, time.Second)
	assert.WithinDuration(t, testUser.UpdatedAt, retrievedUser.UpdatedAt, time.Second)
	assert.WithinDuration(t, testUser.LastSeenAt, retrievedUser.LastSeenAt, time.Second)
	assert.Equal(t, testUser.CurrentStatus, retrievedUser.CurrentStatus)

	// Mock the request with invalid API key
	req = httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	req.Header.Set("x-api-key", "invalidapikey")
	res, err = app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusNotFound, res.StatusCode)
}
