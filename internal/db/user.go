package db

import (
	"context"
	"time"

	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// InsertUserMongo inserts a new user into the users.accounts collection
func InsertUser(user *models.UserMongo) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := UsersAccounts.InsertOne(ctx, user)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to insert user into MongoDB")
		return err
	}

	return nil
}

// UpdateUserMongo updates an existing user in the users.accounts collection
func UpdateUser(username string, updates bson.M) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"username": username}
	update := bson.M{"$set": updates}
	_, err := UsersAccounts.UpdateOne(ctx, filter, update)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to update user in MongoDB")
		return err
	}

	return nil
}

// FindUserByUsername finds a user in the users.accounts collection by username
func FindUserByUsername(username string) (*models.UserMongo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"username": username}
	var user models.UserMongo
	err := UsersAccounts.FindOne(ctx, filter).Decode(&user)
	if err != nil {
		util.Logger.Error().Err(err).Msgf("Failed to find user %s in MongoDB", username)
		return nil, err
	}

	return &user, nil
}

// GetUserByAPIKey returns a user from the users.accounts collection by API key
func GetUserByAPIKey(apiKey string) (*models.UserMongo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	filter := bson.M{"api_key": apiKey}
	projection := bson.M{"password": 0}
	opts := options.FindOne().SetProjection(projection)

	var user models.UserMongo
	err := UsersAccounts.FindOne(ctx, filter, opts).Decode(&user)
	if err != nil {
		return nil, err
	}

	return &user, nil
}
