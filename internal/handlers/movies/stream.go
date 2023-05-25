package movies

import (
	"net/http"
	"os"
	"strconv"

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
		util.Logger.Error().Err(err).Msg("Failed to find movie")
		ctx.StopWithJSON(http.StatusNotFound, iris.Map{
			"status":  http.StatusText(http.StatusNotFound),
			"message": "Movie not found",
		})
		return
	}

	filePath := movie.Files[0]

	fileStat, err := os.Stat(filePath)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to get file stats")
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to get file stats",
		})
		return
	}

	rangeHeader := ctx.GetHeader("Range")
	var rangeValue *util.RangeParserResult
	if rangeHeader != "" {
		rangeValue, err = util.ParseRange(int(fileStat.Size()), rangeHeader, util.RangeParserOptions{Combine: true})
		if err != nil {
			util.Logger.Error().Err(err).Msg("Failed to parse range header")
			ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
				"status":  http.StatusText(http.StatusBadRequest),
				"message": "Invalid range header",
			})
			return
		}
	}

	ctx.Header("Accept-Ranges", "bytes")
	ctx.Header("Content-Type", "application/octet-stream")
	ctx.Header("transferMode.dlna.org", "Streaming")
	ctx.Header("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000")

	util.Logger.Info().Msgf("Streaming: %s", filePath)
	if rangeValue != nil {
		ctx.Header("Content-Length", strconv.FormatInt(int64(rangeValue.Ranges[0].End)-int64(rangeValue.Ranges[0].Start)+1, 10))
		ctx.Header("Content-Range", "bytes "+strconv.FormatInt(int64(rangeValue.Ranges[0].Start), 10)+"-"+strconv.FormatInt(int64(rangeValue.Ranges[0].End), 10)+"/"+strconv.FormatInt(fileStat.Size(), 10))
		ctx.StatusCode(http.StatusPartialContent)
		// TO-DO: send stream with partial content
		return
	}

	ctx.Header("Content-Length", strconv.FormatInt(fileStat.Size(), 10))
	ctx.StatusCode(http.StatusOK)
	// TO-DO: send stream with full content

}
