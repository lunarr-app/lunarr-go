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
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"
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

	// Insert the test user into the database
	err := db.InsertUser(&testUser)
	assert.NoError(t, err)

	// Create a new Fiber app
	app := fiber.New()

	// Create a sub-router for authenticated API routes
	api := app.Group("/api")
	api.Use(middleware.AuthenticateAPI)

	// Define the test route
	api.Get("/users", middleware.OnlyAdmin, GetMeHandler)

	// Mock the request as subscriber
	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req.Header.Set("x-api-key", "testapikey")
	res, err := app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, res.StatusCode)

	// Update user role to admin
	err = db.UpdateUser(testUser.Username, map[string]interface{}{
		"role": models.UserRole("admin"),
	})
	assert.NoError(t, err)

	// Mock the request as admin
	req = httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req.Header.Set("x-api-key", "testapikey")
	res, err = app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Mock the request with invalid API key
	req = httptest.NewRequest(http.MethodGet, "/api/users", nil)
	req.Header.Set("x-api-key", "invalidapikey")
	res, err = app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
}
