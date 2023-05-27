package server

import (
	"net/http"

	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func NotFoundPage(ctx iris.Context) {
	ctx.View("404.hbs")
}

func InternalServerErrorPage(ctx iris.Context) {
	ctx.View("500.hbs")
}

func LoginPage(ctx iris.Context) {
	ctx.View("login.hbs")
}

func SignupPage(ctx iris.Context) {
	ctx.View("signup.hbs")
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

	ctx.View("movies.hbs", iris.Map{"movies": popularMovies.Results})
}
