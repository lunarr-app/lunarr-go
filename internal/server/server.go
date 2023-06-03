package server

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/template/handlebars/v2"

	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/auth"
	"github.com/lunarr-app/lunarr-go/internal/handlers/movies"
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/web"
	"github.com/lunarr-app/lunarr-go/web/router"
)

func New() *fiber.App {
	// Create a new Fiber application
	engine := handlebars.New("./web/views", ".hbs")
	app := fiber.New(fiber.Config{
		Views: engine,
	})

	// Set up a custom logger
	customLogger := logger.New(logger.Config{
		Format:     "${status} ${ip} ${method} ${path} - ${latency}\n",
		TimeFormat: "2006-01-02 15:04:05",
	})

	// Register the custom logger as middleware
	app.Use(customLogger)

	// Serve static files
	app.Static("/assets", "./assets")

	// Register web routes
	app.Get("/login", router.LoginPage)
	app.Get("/signup", router.SignupPage)

	// Create a sub-router for authenticated web routes
	fe := app.Group("/")
	fe.Use(middleware.AuthenticateWeb)

	// Register authenticated web routes
	fe.Get("/", router.RootRedirect)
	fe.Get("/movies", router.MoviePage)
	fe.Get("/movies/:tmdb_id", router.MovieDetailsPage)

	// Create a sub-router for auth
	ha := app.Group("/auth")
	ha.Post("/signup", auth.SignupHandler)
	ha.Post("/login", auth.LoginHandler)

	// Create a sub-router for authenticated API routes
	api := app.Group("/api")
	api.Use(middleware.AuthenticateAPI)

	// Register authenticated API routes
	api.Get("/", handlers.RootHandler)
	api.Get("/movies", movies.ListsHandler)
	api.Get("/movies/:tmdb_id/stream", movies.MovieStreamHandler)

	// Route to render error pages
	app.Use(router.NotFoundPage)
	app.Use(router.InternalServerErrorPage)

	// Define custom template functions
	engine.AddFunc("TMDbGetImageURL", tmdb.GetImageURL)
	engine.AddFunc("TMDbFormatReleaseDate", tmdb.FormatReleaseDate)
	engine.AddFunc("IncludeFile", web.IncludeFile)

	// Return the application instance
	return app
}
