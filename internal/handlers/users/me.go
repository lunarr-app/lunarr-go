package users

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"gorm.io/gorm"
)

// @Summary Get User Data
// @Description Retrieve the user data for the authenticated user.
// @Tags users
// @Security ApiKeyAuth
// @Security ApiKeyQuery
// @Accept json
// @Produce json
// @Param x-api-key header string true "API Key"
// @Success 200 {object} models.UserAccounts
// @Failure 404 {object} schema.ErrorResponse
// @Failure 500 {object} schema.ErrorResponse
// @Router /api/users/me [get]
func GetMeHandler(c *fiber.Ctx) error {
	apiKey := c.Get("x-api-key")
	user, err := db.GetUserByAPIKey(apiKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(http.StatusNotFound).JSON(schema.ErrorResponse{
				Status:  http.StatusText(http.StatusNotFound),
				Message: "User not found",
			})
		}

		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: err.Error(),
		})
	}

	// Return the user object directly
	return c.Status(http.StatusOK).JSON(user)
}
