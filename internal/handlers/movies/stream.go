package movies

import (
	"net/http"
	"os"

	"github.com/kataras/iris/v12"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func MovieStreamHandler(ctx iris.Context) {
	tmdbID, err := ctx.Params().GetInt64("tmdb_id")
	if err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Invalid tmdb id",
		})
		return
	}

	movie, err := db.FindMovieByTmdbID(tmdbID)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to find movie by TMDb ID")
		ctx.StopWithJSON(http.StatusNotFound, iris.Map{
			"status":  http.StatusText(http.StatusNotFound),
			"message": "Movie not found",
		})
		return
	}

	filePath := movie.Files[0]

	file, err := os.Open(filePath)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to open file")
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to open file",
		})
		return
	}
	defer file.Close()

	fileStat, err := file.Stat()
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to get file stats")
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to get file stats",
		})
		return
	}

	util.Logger.Info().Msgf("Streaming: %s", filePath)
	ctx.Header("transferMode.dlna.org", "Streaming")
	ctx.Header("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000")
	ctx.ServeContent(file, fileStat.Name(), fileStat.ModTime())
}
