package handlers

import (
	"context"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"lunarr/internal/models"
)

func SignupHandler(ctx iris.Context) {
	var userReq models.UserSignup
	if err := ctx.ReadJSON(&userReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"error": "invalid request body"})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(userReq); err != nil {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"error": err.Error()})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), bcrypt.DefaultCost)
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"error": "failed to hash password"})
		return
	}

	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI("mongodb://localhost:27017")
	client, err := mongo.Connect(context.Background(), clientOptions)
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"error": "failed to connect to database"})
		return
	}
	defer client.Disconnect(context.Background())

	// Check if the username already exists in the database
	collection := client.Database("mydb").Collection("users")
	filter := bson.M{"username": userReq.Username}
	var existingUser models.UserSignup
	err = collection.FindOne(context.Background(), filter).Decode(&existingUser)
	if err != nil && err != mongo.ErrNoDocuments {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"error": "failed to check username availability"})
		return
	}
	if existingUser.Username != "" {
		ctx.StatusCode(http.StatusBadRequest)
		ctx.JSON(map[string]string{"error": "username already exists"})
		return
	}

	// Create new user
	newUser := &models.UserSignup{
		Displayname: userReq.Displayname,
		Username:    userReq.Username,
		Password:    string(hashedPassword),
		Sex:         userReq.Sex,
	}
	_, err = collection.InsertOne(context.Background(), newUser)
	if err != nil {
		ctx.StatusCode(http.StatusInternalServerError)
		ctx.JSON(map[string]string{"error": "failed to create user"})
		return
	}

	ctx.StatusCode(http.StatusCreated)
	ctx.JSON(map[string]string{"message": "user created successfully"})
}
