package middleware

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"gorm.io/gorm"
)

func AuthenticateAPI(ctx *fiber.Ctx) error {
	// Get the API key from the header or query parameter
	apiKey := ctx.Get("x-api-key")
	if apiKey == "" {
		apiKey = ctx.Query("api_key")
	}

	if apiKey == "" {
		return ctx.Status(http.StatusUnauthorized).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusUnauthorized),
			"message": "API key not provided",
		})
	}

	user, err := db.GetUserByAPIKey(apiKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ctx.Status(http.StatusUnauthorized).JSON(fiber.Map{
				"status":  http.StatusText(http.StatusUnauthorized),
				"message": "Invalid API key",
			})
		}

		return ctx.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to authenticate",
		})
	}

	// Set the authenticated user in the context
	ctx.Locals("user", user)

	return ctx.Next()
}
