package middleware

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
)

// Authenticate middleware checks if a valid API key is provided in the header
// and if it belongs to a valid user in the database
func AuthenticateAPI(ctx *fiber.Ctx) error {
	// Get the API key from the header
	apiKey := ctx.Get("x-api-key")

	// Check if the API key is empty
	if apiKey == "" {
		return ctx.Status(http.StatusUnauthorized).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusUnauthorized),
			"message": "API key not provided",
		})
	}

	// Get the user associated with the API key
	user, err := db.GetUserByAPIKey(apiKey)
	if err != nil {
		return ctx.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to authenticate",
		})
	}

	// Set the authenticated user in the context
	ctx.Locals("user", user)

	return ctx.Next()
}
