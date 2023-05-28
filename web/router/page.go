package router

import (
	"net/http"

	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func RootRedirect(ctx iris.Context) {
	// Check if the user is logged in
	if user := ctx.Values().Get("user"); user != nil {
		// User is logged in, redirect to /movies
		ctx.Redirect("/movies", http.StatusFound)
		return
	}

	// User is not logged in, redirect to /login
	ctx.Redirect("/login", http.StatusFound)
}

func MoviePage(ctx iris.Context) {
	// Retrieve popular movies from TMDb
	popularMovies, err := tmdb.TmdbClient.GetMoviePopular(nil)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to get popular movies from TMD")
		ctx.StatusCode(http.StatusInternalServerError)
		InternalServerErrorPage(ctx)
		return
	}

	// Render the view template
	err = ctx.View("movies.hbs", iris.Map{"movies": popularMovies.Results})
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to render the view template")
		ctx.StatusCode(http.StatusInternalServerError)
		InternalServerErrorPage(ctx)
		return
	}
}
