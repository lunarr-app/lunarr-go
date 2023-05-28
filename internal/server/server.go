package server

import (
	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/middleware/logger"

	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/auth"
	"github.com/lunarr-app/lunarr-go/internal/handlers/movies"
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"
	"github.com/lunarr-app/lunarr-go/internal/server/webpages"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
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

	// Register view engine
	tmpl := iris.Handlebars("./views", ".hbs")
	app.RegisterView(tmpl)

	// Serve static files
	app.HandleDir("/assets", iris.Dir("./assets"))

	// Register web routes
	web := app.Party("/")
	web.Get("/movies", webpages.MoviePage)
	web.Get("/login", webpages.LoginPage)
	web.Get("/signup", webpages.SignupPage)

	// Create a sub-router for auth
	ha := app.Party("/auth")
	ha.Post("/signup", auth.SignupHandler)
	ha.Post("/login", auth.LoginHandler)

	// Create a sub-router for authenticated API routes
	api := app.Party("/api")
	api.Use(middleware.Authenticate)

	// Register authenticated API routes
	api.Get("/", handlers.RootHandler)
	api.Get("/movies", movies.ListsHandler)
	api.Get("/movies/{tmdb_id}/stream", movies.MovieStreamHandler)

	// // Route to render error pages
	app.OnErrorCode(iris.StatusNotFound, webpages.NotFoundPage)
	app.OnErrorCode(iris.StatusInternalServerError, webpages.InternalServerErrorPage)

	// Define handlebars helper functions
	tmpl.AddFunc("TMDbGetImageURL", tmdb.GetImageURL)
	tmpl.AddFunc("TMDbFormatReleaseDate", tmdb.FormatReleaseDate)

	// Return the application instance
	return app
}
