package server

import (
	"io/fs"

	"github.com/kataras/iris/v12"
	"github.com/kataras/iris/v12/middleware/logger"

	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/handlers/auth"
	"github.com/lunarr-app/lunarr-go/internal/handlers/movies"
	"github.com/lunarr-app/lunarr-go/internal/server/middleware"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
	"github.com/lunarr-app/lunarr-go/web"
	"github.com/lunarr-app/lunarr-go/web/router"
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
	views, err := fs.Sub(web.ViewsFS, "views")
	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to load web/views")
	}
	tmpl := iris.Handlebars(views, ".hbs")
	app.RegisterView(tmpl)

	// Serve static files
	app.HandleDir("/assets", web.AssetsFS)

	// Register web routes
	app.Get("/login", router.LoginPage)
	app.Get("/signup", router.SignupPage)

	// Create a sub-router for authenticated web routes
	fe := app.Party("/")
	fe.Use(middleware.AuthenticateWeb)

	// Register authenticated web routes
	fe.Get("/", router.RootRedirect)
	fe.Get("/movies", router.MoviePage)
	fe.Get("/movies/{tmdb_id}", router.MovieDetailsPage)

	// Create a sub-router for auth
	ha := app.Party("/auth")
	ha.Post("/signup", auth.SignupHandler)
	ha.Post("/login", auth.LoginHandler)

	// Create a sub-router for authenticated API routes
	api := app.Party("/api")
	api.Use(middleware.AuthenticateAPI)

	// Register authenticated API routes
	api.Get("/", handlers.RootHandler)
	api.Get("/movies", movies.ListsHandler)
	api.Get("/movies/{tmdb_id}/stream", movies.MovieStreamHandler)

	// // Route to render error pages
	app.OnErrorCode(iris.StatusNotFound, router.NotFoundPage)
	app.OnErrorCode(iris.StatusInternalServerError, router.InternalServerErrorPage)

	// Define handlebars helper functions
	tmpl.AddFunc("TMDbGetImageURL", tmdb.GetImageURL)
	tmpl.AddFunc("TMDbFormatReleaseDate", tmdb.FormatReleaseDate)
	tmpl.AddFunc("IncludeFile", web.IncludeFile)

	// Return the application instance
	return app
}
