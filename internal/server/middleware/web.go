package middleware

import (
	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/db"
)

// AuthenticateWeb middleware checks if a valid API key is provided as a cookie
// and if it belongs to a valid user in the database
func AuthenticateWeb(ctx iris.Context) {
	// Check if the user is on the homepage
	if ctx.Path() == "/" {
		// Continue to the next route handler
		ctx.Next()
		return
	}

	// Get the API key from the cookie
	cookie, err := ctx.Request().Cookie("api_key")
	if err != nil {
		ctx.Redirect("/login", iris.StatusFound)
		return
	}

	// Get the user associated with the API key
	user, err := db.GetUserByAPIKey(cookie.Value)
	if err != nil {
		ctx.Redirect("/login", iris.StatusFound)
		return
	}

	// Set the authenticated user in the context
	ctx.Values().Set("user", user)

	ctx.Next()
}
