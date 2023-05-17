package db

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
)

func CheckMovieExists(filePath string) bool {
	filter := bson.M{
		"files": filePath,
	}

	var result bson.M
	err := MoviesLists.FindOne(context.TODO(), filter).Decode(&result)
	if err != nil {
		return false
	}

	return result != nil
}
