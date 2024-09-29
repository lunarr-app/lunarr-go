package users

import (
	"net/http"

	"github.com/gofiber/fiber/v2"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/schema"
)

// @Summary Get All Users
// @Description Retrieve all users.
// @Tags users
// @Security ApiKeyAuth
// @Security ApiKeyQuery
// @Accept json
// @Produce json
// @Success 200 {array} models.UserAccounts
// @Failure 500 {object} schema.ErrorResponse
// @Router /api/users [get]
func UserRootHandler(c *fiber.Ctx) error {
	users, err := db.FindAllUsers()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: err.Error(),
		})
	}

	// Return the list of users as an array of models.UserAccounts
	return c.Status(http.StatusOK).JSON(users)
}
