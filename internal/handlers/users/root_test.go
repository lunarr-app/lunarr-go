package users

import (
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

func TestUserRootHandler(t *testing.T) {
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

	// Create a new Fiber app
	app := fiber.New()

	// Insert the test user into the database
	err := db.InsertUser(&testUser)
	assert.NoError(t, err)

	// Define the test route
	app.Get("/api/users", GetMeHandler)

	// Mock the request
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req.Header.Set("x-api-key", "testapikey")
	res, err := app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Mock the request with invalid API key
	req = httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req.Header.Set("x-api-key", "invalidapikey")
	res, err = app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusNotFound, res.StatusCode)
}
