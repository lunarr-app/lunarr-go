package server

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/template/handlebars/v2"

	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/auth"
	"github.com/lunarr-app/lunarr-go/internal/handlers/movies"
	"github.com/lunarr-app/lunarr-go/internal/handlers/users"
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
	"github.com/lunarr-app/lunarr-go/web"
	"github.com/lunarr-app/lunarr-go/web/router"

	"github.com/gofiber/swagger"
	_ "github.com/lunarr-app/lunarr-go/docs"
)

// @title Lunarr API
// @version 1.0
// @description Swagger for Lunarr API endpoints
// @host 127.0.0.1:3000
// @BasePath /
func New() *fiber.App {
	// Define custom template functions
	templateFuncs := map[string]interface{}{
		"TMDbGetImageURL":       tmdb.GetImageURL,
		"TMDbFormatReleaseDate": tmdb.FormatReleaseDate,
		"IncludeFile":           web.IncludeFile,
	}

	// Load views using embed FS
	views, err := web.GetViewsFS()
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to load web views")
	}

	// Create the handlebars engine with the views file systemand template functions
	engine := handlebars.NewFileSystem(views, ".hbs")
	engine.AddFuncMap(templateFuncs)

	// Create a new Fiber application
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

	// Swagger UI
	app.Get("/swagger/*", swagger.HandlerDefault)

	// Load assets using embed FS
	assets, err := web.GetAssetsFS()
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to load web assets")
	}

	// Serve static files
	app.Use("/assets", filesystem.New(filesystem.Config{
		Root: assets,
	}))

	// Register test route
	app.Get("/hello", handlers.RootHandlerHello)

	// Register web routes
	app.Get("/", handlers.RootHandlerWeb)
	app.Get("/login", router.LoginPage)
	app.Get("/signup", router.SignupPage)

	// Create a sub-router for authenticated web routes
	fe := app.Group("/app")

	// Web routes to render error pages
	fe.Get("/", router.RootRedirect) // This will be updated later when all features will be available
	fe.Use(router.NotFoundPage)
	fe.Use(router.InternalServerErrorPage)

	// Register authenticated web routes
	fe.Use(middleware.AuthenticateWeb)
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
	api.Get("/movies", movies.MovieRootHandler)
	api.Get("/movies/:tmdb_id/stream", movies.MovieStreamHandler)
	api.Get("/users", users.UserRootHandler)
	api.Get("/users/me", users.GetMeHandler)

	// Return the application instance
	return app
}
