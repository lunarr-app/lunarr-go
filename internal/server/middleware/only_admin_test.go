package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestOnlyAdmin(t *testing.T) {
	// Create a new Fiber app
	app := fiber.New()

	// Define test routes that requires admin privileges
	app.Get("/admin", addContextAdmin, OnlyAdmin, func(c *fiber.Ctx) error {
		return c.SendString("Admin Route")
	})
	app.Get("/user", addContextUser, OnlyAdmin, func(c *fiber.Ctx) error {
		return c.SendString("Admin Route")
	})

	// Mock the request with a user that has admin role
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	res, err := app.Test(req)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Read the response body
	body, err := io.ReadAll(res.Body)
	assert.NoError(t, err)

	// Assert the response body
	assert.Equal(t, "Admin Route", string(body))

	// Mock the request with a user that doesn't have admin role
	req = httptest.NewRequest(http.MethodGet, "/user", nil)
	res, err = app.Test(req)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusForbidden, res.StatusCode)
}

func addContextAdmin(ctx *fiber.Ctx) error {
	user := &models.UserAccounts{
		Role: models.UserRoleAdmin,
	}
	ctx.Locals("user", user)

	return ctx.Next()
}

func addContextUser(ctx *fiber.Ctx) error {
	user := &models.UserAccounts{
		Role: models.UserRoleSubscriber,
	}
	ctx.Locals("user", user)

	return ctx.Next()
}
