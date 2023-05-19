package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func SignupHandler(ctx iris.Context) {
	var userReq models.UserSignup
	if err := ctx.ReadJSON(&userReq); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status": http.StatusText(http.StatusBadRequest),
			"error":  err.Error(),
		})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(userReq); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status": http.StatusText(http.StatusBadRequest),
			"error":  err.Error(),
		})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), bcrypt.DefaultCost)
	if err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status": http.StatusText(http.StatusInternalServerError),
			"error":  "Failed to hash password",
		})
		return
	}

	// Check if the username already exists in the database
	var existingUser models.UserSignup
	err = db.UsersAccounts.FindOne(context.Background(), bson.M{"username": userReq.Username}).Decode(&existingUser)
	if err != nil && err != mongo.ErrNoDocuments {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status": http.StatusText(http.StatusInternalServerError),
			"error":  "Failed to check username availability",
		})
		return
	}
	if existingUser.Username != "" {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status": http.StatusText(http.StatusBadRequest),
			"error":  "Username already exists",
		})
		return
	}

	// Check if the database is empty
	count, err := db.UsersAccounts.CountDocuments(context.Background(), bson.M{})
	if err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status": http.StatusText(http.StatusInternalServerError),
			"error":  "Failed to check database",
		})
		return
	}

	var role models.UserRole
	if count == 0 {
		role = models.UserRoleAdmin
	} else {
		role = models.UserRoleSubscriber
	}

	// Create new user
	newUser := &models.UserMongo{
		Displayname:   userReq.Displayname,
		Username:      userReq.Username,
		Password:      string(hashedPassword),
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
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
	}

	// Generate API key
	apiKey, err := util.GenerateAPIKey()
	if err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status": http.StatusText(http.StatusInternalServerError),
			"error":  "Failed to generate API key",
		})
		return
	}
	newUser.APIKey = apiKey

	// Insert new user into database
	if err := db.InsertUser(newUser); err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status": http.StatusText(http.StatusInternalServerError),
			"error":  "Failed to create user",
		})
		return
	}

	ctx.StatusCode(http.StatusCreated)
	ctx.JSON(iris.Map{
		"status":  http.StatusText(http.StatusCreated),
		"message": "User created successfully",
	})
}
