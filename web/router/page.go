package router

import (
	"net/http"

	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func RootRedirect(ctx iris.Context) {
	ctx.Redirect("/movies", http.StatusFound)
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

func MovieDetailsPage(ctx iris.Context) {
	// Get the movie ID from the URL parameter
	movieID, err := ctx.Params().GetInt("tmdb_id")
	if err != nil {
		util.Logger.Error().Err(err).Msg("Invalid movie ID")
		ctx.StatusCode(http.StatusBadRequest)
		// BadRequestPage(ctx)
		return
	}

	// Retrieve movie details from TMDb
	movieDetails, err := tmdb.TmdbClient.GetMovieDetails(movieID, nil)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to get movie details from TMDb")
		ctx.StatusCode(http.StatusInternalServerError)
		InternalServerErrorPage(ctx)
		return
	}

	// Render the view template
	err = ctx.View("movie-details.hbs", iris.Map{"Movie": movieDetails})
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to render the view template")
		ctx.StatusCode(http.StatusInternalServerError)
		InternalServerErrorPage(ctx)
		return
	}
}
