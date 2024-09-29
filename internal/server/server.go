package server

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"

	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/movies"
	"github.com/lunarr-app/lunarr-go/internal/handlers/users"
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"

	"github.com/gofiber/swagger"
	_ "github.com/lunarr-app/lunarr-go/docs"
)

// @title Lunarr API
// @version 1.0
// @description Swagger for Lunarr API endpoints

// @host 127.0.0.1:8484
// @BasePath /

// @securityDefinitions.apikey ApiKeyAuth
// @in header
// @name x-api-key

// @securityDefinitions.apikey ApiKeyQuery
// @in query
// @name api_key
func New() *fiber.App {
	app := fiber.New()

	app.Use(logger.New(logger.Config{
		Format:     "${status} ${ip} ${method} ${path} - ${latency}\n",
		TimeFormat: "2006-01-02 15:04:05",
	}))

	app.Use(cors.New(cors.Config{
		AllowOrigins:     "*",
		AllowCredentials: false,
	}))

	// Swagger UI
	app.Get("/swagger/*", swagger.HandlerDefault)

	// Register root routes
	app.Get("/hello", handlers.RootHandlerHello)

	// Create a sub-router for authenticated API routes
	api := app.Group("/api")
	api.Use(middleware.AuthenticateAPI)

	// Register user routes
	api.Get("/users", middleware.OnlyAdmin, users.UserRootHandler)
	api.Get("/users/me", users.GetMeHandler)

	// Register movie routes
	api.Get("/movies", movies.MovieRootHandler)
	api.Get("/movies/:tmdb_id", movies.MovieByIDHandler)
	api.Get("/movies/:tmdb_id/stream", movies.MovieStreamHandler)

	return app
}
