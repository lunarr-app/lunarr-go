package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestAuthenticateAPI(t *testing.T) {
	config.InitConfig()
	db.InitDatabase()

	// Create a new Fiber app instance
	app := fiber.New()

	// Insert the test user into the database
	err := db.InsertUser(&models.UserAccounts{
		APIKey: "valid-api-key",
	})
	assert.NoError(t, err)

	// Define a test route that uses the AuthenticateAPI middleware
	app.Get("/protected", AuthenticateAPI, func(ctx *fiber.Ctx) error {
		// Return a success response
		return ctx.Status(http.StatusOK).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusOK),
			"message": "Protected route",
		})
	})

	// Define a test route that does not use the middleware
	app.Get("/unprotected", func(ctx *fiber.Ctx) error {
		// Return a success response
		return ctx.Status(http.StatusOK).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusOK),
			"message": "Unprotected route",
		})
	})

	// Create a test case for the scenario when a valid API key is provided
	t.Run("Valid API Key", func(t *testing.T) {
		// Perform a GET request to the protected route with a valid API key in the header
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("x-api-key", "valid-api-key")
		resp, err := app.Test(req)

		// Assert that the request was successful (200 OK)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		assert.NoError(t, err)

		// Assert the response body as JSON
		expectedBody := `{"status":"OK","message":"Protected route"}`
		assert.JSONEq(t, expectedBody, string(body))
	})

	// Create a test case for the scenario when an empty API key is provided
	t.Run("Empty API Key", func(t *testing.T) {
		// Perform a GET request to the protected route without an API key in the header
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/protected", nil))

		// Assert that the request was unauthorized (401 Unauthorized)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		assert.NoError(t, err)

		// Assert the response body as JSON
		expectedBody := `{"status":"Unauthorized","message":"API key not provided"}`
		assert.JSONEq(t, expectedBody, string(body))
	})

	// Create a test case for the scenario when an invalid API key is provided
	t.Run("Invalid API Key", func(t *testing.T) {
		// Perform a GET request to the protected route with an invalid API key in the header
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("x-api-key", "invalid-api-key")
		resp, err := app.Test(req)

		// Assert that the request resulted in an internal server error (500 Internal Server Error)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		assert.NoError(t, err)

		// Assert the response body as JSON
		expectedBody := `{"status":"Unauthorized","message":"Invalid API key"}`
		assert.JSONEq(t, expectedBody, string(body))
	})

	// Create a test case for an unprotected route
	t.Run("Unprotected Route", func(t *testing.T) {
		// Perform a GET request to the unprotected route
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/unprotected", nil))

		// Assert that the request was successful (200 OK)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		assert.NoError(t, err)

		// Assert the response body as JSON
		expectedBody := `{"status":"OK","message":"Unprotected route"}`
		assert.JSONEq(t, expectedBody, string(body))
	})
}
