package server

import (
	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/middleware/logger"

	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/auth"
	"github.com/lunarr-app/lunarr-go/server/middleware"
)

func New() *iris.Application {
	// Create a new Iris application
	app := iris.New()

	// Set up a custom logger
	customLogger := logger.New(logger.Config{
		Status:           true,
		IP:               true,
		Method:           true,
		Path:             true,
		PathAfterHandler: true,
		Query:            true,
	})

	// Register the custom logger as middleware
	app.Use(customLogger)

	// Create a sub-router for auth
	ha := app.Party("/auth")
	ha.Post("/signup", auth.SignupHandler)
	ha.Post("/login", auth.LoginHandler)

	// Create a sub-router for authenticated API routes
	api := app.Party("/api")
	api.Use(middleware.Authenticate)

	// Register authenticated API routes
	api.Get("/", handlers.RootHandler)

	// Return the application instance
	return app
}
