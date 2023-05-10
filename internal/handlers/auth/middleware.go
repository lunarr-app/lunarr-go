package auth

import (
	"context"
	"net/http"

	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func Authenticate(ctx iris.Context) {
	// Get the API key from the header
	apiKey := ctx.GetHeader("x-api-key")
	if apiKey == "" {
		ctx.StopWithJSON(http.StatusUnauthorized, iris.Map{
			"status":  http.StatusText(http.StatusUnauthorized),
			"message": "API key not provided",
		})
		return
	}

	// Check if the API key exists in the database
	var user models.UserMongo
	err := db.UsersAccounts.FindOne(context.Background(), bson.M{"api_key": apiKey}).Decode(&user)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			ctx.StopWithJSON(http.StatusUnauthorized, iris.Map{
				"status":  http.StatusText(http.StatusUnauthorized),
				"message": "Invalid API key",
			})
			return
		}

		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to authenticate",
		})
		return
	}

	// Set the authenticated user in the context
	ctx.Values().Set("user", user)

	ctx.Next()
}
