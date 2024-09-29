package auth

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/schema"
)

// @Summary Login
// @Description Login
// @Tags auth
// @Accept json
// @Produce json
// @Param loginReq body schema.UserLogin true "Login Request"
// @Success 200 {object} schema.UserLoginResponse
// @Failure 400 {object} schema.ErrorResponse
// @Router /auth/login [post]
func LoginHandler(c *fiber.Ctx) error {
	var loginReq schema.UserLogin
	if err := c.BodyParser(&loginReq); err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	if err := loginReq.Validate(); err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	user, err := db.FindUserByUsername(loginReq.Username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(http.StatusNotFound).JSON(schema.ErrorResponse{
				Status:  http.StatusText(http.StatusNotFound),
				Message: "User not found",
			})
		}

		log.Error().Err(err).Msgf("Failed to find user %s in database", loginReq.Username)

		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to find user",
		})
	}

	if !db.VerifyUserPassword(loginReq.Username, loginReq.Password) {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: "Invalid username or password",
		})
	}

	return c.Status(http.StatusOK).JSON(schema.UserLoginResponse{
		Status: http.StatusText(http.StatusOK),
		APIKey: user.APIKey,
	})
}
