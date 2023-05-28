package middleware

import (
	"net/http"

	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"go.mongodb.org/mongo-driver/mongo"
)

// Authenticate middleware checks if a valid API key is provided in the header
// or as a cookie and if it belongs to a valid user in the database
func Authenticate(ctx iris.Context) {
	// Get the API key from the header
	apiKey := ctx.GetHeader("x-api-key")

	// Check if the API key is empty
	if apiKey == "" {
		// Get the API key from the cookie
		cookie, err := ctx.Request().Cookie("api_key")
		if err != nil {
			if err == http.ErrNoCookie {
				ctx.StopWithJSON(http.StatusUnauthorized, iris.Map{
					"status":  http.StatusText(http.StatusUnauthorized),
					"message": "API key not provided",
				})
				return
			}

			ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
				"status":  http.StatusText(http.StatusInternalServerError),
				"message": "Failed to authenticate",
			})
			return
		}

		apiKey = cookie.Value
	}

	// Get the user associated with the API key
	user, err := db.GetUserByAPIKey(apiKey)
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
