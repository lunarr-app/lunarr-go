package users

import (
	"net/http"

	"github.com/gofiber/fiber/v2"

	"github.com/lunarr-app/lunarr-go/internal/db"
)

// @Summary Get All Users
// @Description Retrieve all users.
// @Tags users
// @Accept json
// @Produce json
// @Success 200 {array} models.UserAccounts
// @Failure 500 {object} schema.ErrorResponse
// @Router /api/users [get]
func UserRootHandler(c *fiber.Ctx) error {
	users, err := db.FindAllUsers()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": err.Error(),
		})
	}

	return c.JSON(users)
}
