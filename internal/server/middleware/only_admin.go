package middleware

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/schema"
)

func OnlyAdmin(ctx *fiber.Ctx) error {
	// Check if the user has admin privileges
	user := ctx.Locals("user").(*models.UserAccounts)
	if user.Role != models.UserRoleAdmin {
		return ctx.Status(http.StatusForbidden).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusForbidden),
			Message: "Only admins can access this route.",
		})
	}

	// Continue to the next handler if the user is an admin
	return ctx.Next()
}
