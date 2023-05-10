package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/lunarr-app/lunarr-go/internal/common"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func SignupHandler(ctx iris.Context) {
	var userReq models.UserSignup
	if err := ctx.ReadJSON(&userReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": err.Error()})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(userReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": err.Error()})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), bcrypt.DefaultCost)
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to hash password"})
		return
	}

	// Check if the username already exists in the database
	var existingUser models.UserSignup
	err = db.UsersAccounts.FindOne(context.Background(), bson.M{"username": userReq.Username}).Decode(&existingUser)
	if err != nil && err != mongo.ErrNoDocuments {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to check username availability"})
		return
	}
	if existingUser.Username != "" {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusBadRequest), "message": "Username already exists"})
		return
	}

	// Check if the database is empty
	count, err := db.UsersAccounts.CountDocuments(context.Background(), bson.M{})
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to check database"})
		return
	}

	var role string
	if count == 0 {
		role = "admin"
	} else {
		role = "subscriber"
	}

	// Create new user
	newUser := &models.UserMongo{
		Displayname:   userReq.Displayname,
		Username:      userReq.Username,
		Password:      string(hashedPassword),
		Sex:           userReq.Sex,
		Role:          role,
		APIKey:        "",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		LastSeenAt:    time.Now(),
		CurrentStatus: "active",
	}

	// Generate API key
	apiKey, err := common.GenerateAPIKey()
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to generate API key"})
		return
	}
	newUser.APIKey = apiKey

	// Insert new user into database
	if err := db.InsertUser(newUser); err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"status": http.StatusText(http.StatusInternalServerError), "message": "Failed to create user"})
		return
	}

	ctx.StatusCode(http.StatusCreated)
	ctx.JSON(map[string]string{"status": http.StatusText(http.StatusCreated), "message": "User created successfully"})
}
