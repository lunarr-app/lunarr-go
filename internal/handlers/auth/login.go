package auth

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// @Summary Login
// @Description Login
// @Tags auth
// @Accept json
// @Produce json
// @Param loginReq body UserLogin true "Login Request"
// @Success 200 {object} UserLoginResponse
// @Failure 400 {object} ErrorResponse
// @Router /auth/login [post]
func LoginHandler(c *fiber.Ctx) error {
	var loginReq UserLogin
	if err := c.BodyParser(&loginReq); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(loginReq); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Find user in database
	user, err := db.FindUserByUsername(loginReq.Username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{
				"status":  http.StatusText(http.StatusNotFound),
				"message": "User not found",
			})
		}

		util.Logger.Error().Err(err).Msgf("Failed to find user %s in database", loginReq.Username)

		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to find user",
		})

	}

	// Compare password hash
	if !db.VerifyUserPassword(loginReq.Username, loginReq.Password) {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Invalid username or password",
		})
	}

	// Set API key on a cookie
	cookie := fiber.Cookie{
		Name:     "api_key",
		Value:    user.APIKey,
		Path:     "/",
		HTTPOnly: true,
		MaxAge:   86400 * 30, // 30 days in seconds
		SameSite: "Strict",
	}
	c.Cookie(&cookie)

	return c.Status(http.StatusOK).JSON(fiber.Map{"status": http.StatusText(http.StatusOK), "api_key": user.APIKey})
}
