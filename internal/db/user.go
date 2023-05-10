package db

import (
	"context"
	"time"

	"github.com/lunarr-app/lunarr-go/internal/common"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

// InsertUserMongo inserts a new user into the users.accounts collection
func InsertUser(user *models.UserMongo) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := UsersAccounts.InsertOne(ctx, user)
	if err != nil {
		common.Logger.Error().Err(err).Msg("Failed to insert user into MongoDB")
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
		common.Logger.Error().Err(err).Msg("Failed to update user in MongoDB")
		return err
	}

	return nil
}
