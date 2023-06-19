package auth

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// @Summary User Signup
// @Description Creates a new user account.
// @Tags auth
// @Accept json
// @Produce json
// @Param userReq body schema.UserSignup true "User Signup Request"
// @Success 201 {object} schema.UserSignupResponse
// @Failure 400 {object} schema.ErrorResponse
// @Failure 500 {object} schema.ErrorResponse
// @Router /auth/signup [post]
func SignupHandler(c *fiber.Ctx) error {
	var userReq schema.UserSignup
	if err := c.BodyParser(&userReq); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(userReq); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Check if the email or username already exists in the database
	existingUser, err := db.FindUserByEmailOrUsername(userReq.Email, userReq.Username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// The username is available, continue with user creation
		} else {
			util.Logger.Error().Err(err).Msgf("Failed to find user %s in database", userReq.Username)

			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
				"status":  http.StatusText(http.StatusInternalServerError),
				"message": "Failed to check username availability",
			})
		}

	}
	if existingUser != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Username or email already exists",
		})
	}

	// Check if the database is empty
	count, err := db.CountUsers()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to check database",
		})
	}

	var role models.UserRole
	if count == 0 {
		role = models.UserRoleAdmin
	} else {
		role = models.UserRoleSubscriber
	}

	// Create new user
	newUser := &models.UserAccounts{
		Displayname:   userReq.Displayname,
		Username:      userReq.Username,
		Email:         userReq.Email,
		Password:      userReq.Password,
		Sex:           userReq.Sex,
		Role:          role,
		APIKey:        "",
		CurrentStatus: "active",
		Settings: models.UserSettings{
			Theme: "system",
			Subtitle: models.SubtitleSettings{
				Enabled:  true,
				Language: "en-US",
			},
			Transcoding: models.TranscodingSettings{
				Resolution: "direct",
				Bitrate:    2000,
				Codec:      "h264",
			},
		},
		LastSeenAt: time.Now().UTC(),
	}

	// Generate API key
	apiKey, err := util.GenerateAPIKey()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to generate API key",
		})
	}
	newUser.APIKey = apiKey

	// Insert new user into database
	if err := db.InsertUser(newUser); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to create user",
		})
	}

	return c.Status(http.StatusCreated).JSON(fiber.Map{
		"status":  http.StatusText(http.StatusCreated),
		"message": "User created successfully",
	})
}
