package auth

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func LoginHandler(c *fiber.Ctx) error {
	var loginReq models.UserLogin
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
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to find user",
		})

	}

	// Compare password hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(loginReq.Password)); err != nil {
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
