package db

import (
	"context"
	"time"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/util"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var UsersAccounts *mongo.Collection
var MoviesLists *mongo.Collection
var TvShowsLists *mongo.Collection
var WatchHistory *mongo.Collection

func InitDatabase() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	util.Logger.Info().Msg("Creating new MongoClient instance")
	clientOptions := options.Client().ApplyURI(config.Get().Database.URI)
	mongoClient, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to connect to MongoDB")
	}
	err = mongoClient.Ping(ctx, nil)
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to ping MongoDB")
	}

	util.Logger.Info().Msg("Exporting MongoDB collections as typed objects")
	UsersAccounts = mongoClient.Database("lunarr").Collection("users.accounts")
	MoviesLists = mongoClient.Database("lunarr").Collection("movies.lists")
	TvShowsLists = mongoClient.Database("lunarr").Collection("tv_shows.lists")
	WatchHistory = mongoClient.Database("lunarr").Collection("watch.history")

	// Generate index
	CreateIndexes()
}
