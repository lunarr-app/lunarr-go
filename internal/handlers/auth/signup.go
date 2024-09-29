package auth

import (
	"errors"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/config"
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
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	if err := userReq.Validate(); err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	count, err := db.CountUsers()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to check user count in the database",
		})
	}

	// Get app config to check if signup is allowed
	settings := config.Get().AppSettings

	// If new user signup is disabled and there are already users in the database, reject the request
	if !settings.NewUserSignup && count > 0 {
		return c.Status(http.StatusForbidden).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusForbidden),
			Message: "User signup is disabled",
		})
	}

	// If this is the first user, allow signup as an admin regardless of NewUserSignup setting
	var role models.UserRole
	if count == 0 {
		role = models.UserRoleAdmin
	} else {
		role = models.UserRoleSubscriber
	}

	existingUser, err := db.FindUserByEmailOrUsername(userReq.Email, userReq.Username)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Error().Err(err).Msgf("Failed to check user %s in the database", userReq.Username)
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to check username availability",
		})
	}
	if existingUser != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: "Username or email already exists",
		})
	}

	newUser := &models.UserAccounts{
		Displayname:   userReq.Displayname,
		Username:      userReq.Username,
		Email:         userReq.Email,
		Password:      userReq.Password, // Password hashing handled in InsertUser
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

	apiKey, err := util.GenerateAPIKey()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to generate API key",
		})
	}
	newUser.APIKey = apiKey

	if err := db.InsertUser(newUser); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to create user",
		})
	}

	return c.Status(http.StatusCreated).JSON(schema.UserSignupResponse{
		Status:  http.StatusCreated,
		Message: "User created successfully",
	})
}
