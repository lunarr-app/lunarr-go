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

func TestAuthenticateWeb(t *testing.T) {
	config.InitConfig()
	db.InitDatabase()

	// Create a new Fiber app instance
	app := fiber.New()

	// Insert the test user into the database
	err := db.InsertUser(&models.UserAccount{
		APIKey: "valid-api-key",
	})
	assert.NoError(t, err)

	// Define a test route that uses the AuthenticateWeb middleware
	app.Get("/protected", AuthenticateWeb, func(ctx *fiber.Ctx) error {
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

	// Create a test case for the scenario when a valid API key cookie is provided
	t.Run("Valid API Key Cookie", func(t *testing.T) {
		// Perform a GET request to the protected route with a valid API key cookie
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.AddCookie(&http.Cookie{
			Name:  "api_key",
			Value: "valid-api-key",
		})
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

	// Create a test case for the scenario when no API key cookie is provided
	t.Run("No API Key Cookie", func(t *testing.T) {
		// Perform a GET request to the protected route without an API key cookie
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/protected", nil))

		// Assert that the request was redirected (302 Found) to the login page
		assert.NoError(t, err)
		assert.Equal(t, http.StatusFound, resp.StatusCode)
		assert.Equal(t, "/login", resp.Header.Get("Location"))
	})

	// Create a test case for the scenario when an invalid API key cookie is provided
	t.Run("Invalid API Key Cookie", func(t *testing.T) {
		// Perform a GET request to the protected route with an invalid API key cookie
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.AddCookie(&http.Cookie{
			Name:  "api_key",
			Value: "invalid-api-key",
		})
		resp, err := app.Test(req)

		// Assert that the request was redirected (302 Found) to the login page
		assert.NoError(t, err)
		assert.Equal(t, http.StatusFound, resp.StatusCode)
		assert.Equal(t, "/login", resp.Header.Get("Location"))
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
