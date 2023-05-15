package db

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
)

func CheckMovieExists(filePath string) bool {
	filter := bson.M{
		"files": filePath,
	}

	count, err := MoviesLists.CountDocuments(context.TODO(), filter)
	if err != nil {
		return false
	}

	return count > 0
}
