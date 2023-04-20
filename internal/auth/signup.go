package main

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

type UserSignupRequest struct {
	Displayname string `json:"displayname" validate:"required,min=1,max=48"`
	Username    string `json:"username" validate:"required,min=2,max=16,alphanum"`
	Password    string `json:"password" validate:"required,min=6,max=32"`
	Sex         string `json:"sex" validate:"oneof=male female unknown"`
}

type User struct {
	Displayname string `bson:"displayname"`
	Username    string `bson:"username"`
	Password    string `bson:"password"`
	Sex         string `bson:"sex"`
}

func signUp(c echo.Context) error {
	var userReq UserSignupRequest
	if err := c.Bind(&userReq); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
	}

	// Validate user input
	if err := c.Validate(&userReq); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(userReq.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to hash password"})
	}

	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI("mongodb://localhost:27017")
	client, err := mongo.Connect(context.Background(), clientOptions)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to connect to database"})
	}
	defer client.Disconnect(context.Background())

	// Check if the username already exists in the database
	collection := client.Database("mydb").Collection("users")
	filter := bson.M{"username": userReq.Username}
	var existingUser User
	err = collection.FindOne(context.Background(), filter).Decode(&existingUser)
	if err != nil && err != mongo.ErrNoDocuments {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to check username availability"})
	}
	if existingUser.Username != "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "username already exists"})
	}

	// Create new user
	newUser := &User{
		Displayname: userReq.Displayname,
		Username:    userReq.Username,
		Password:    string(hashedPassword),
		Sex:         userReq.Sex,
	}
	_, err = collection.InsertOne(context.Background(), newUser)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
	}

	return c.JSON(http.StatusCreated, map[string]string{"message": "user created successfully"})
}
