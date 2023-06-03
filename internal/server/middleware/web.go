package middleware

import (
	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
)

// AuthenticateWeb middleware checks if a valid API key is provided as a cookie
// and if it belongs to a valid user in the database
func AuthenticateWeb(ctx *fiber.Ctx) error {
	// Check if the user is on the homepage
	if ctx.Path() == "/" {
		// Continue to the next route handler
		return ctx.Next()
	}

	// Get the API key from the cookie
	cookie := ctx.Cookies("api_key")
	if cookie == "" {
		return ctx.Redirect("/login", fiber.StatusFound)
	}

	// Get the user associated with the API key
	user, err := db.GetUserByAPIKey(cookie)
	if err != nil {
		return ctx.Redirect("/login", fiber.StatusFound)
	}

	// Set the authenticated user in the context
	ctx.Locals("user", user)

	return ctx.Next()
}
