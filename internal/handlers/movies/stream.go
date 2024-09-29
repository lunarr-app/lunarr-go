package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"github.com/rs/zerolog/log"
)

// MovieStreamHandler handles the movie streaming request.
// TODO: Implement transcode-based streaming later.
// @Summary Stream a movie
// @Description Stream a movie based on the TMDb ID.
// @Tags movies
// @Accept json
// @Produce octet-stream
// @Param tmdb_id path int true "TMDb ID"
// @Success 200 {file} octet-stream
// @Failure 400 {object} schema.ErrorResponse
// @Failure 404 {object} schema.ErrorResponse
// @Security ApiKeyAuth
// @Security ApiKeyQuery
// @Router /api/movies/{tmdb_id}/stream [get]
func MovieStreamHandler(c *fiber.Ctx) error {
	// Get the tmdb_id parameter from the request
	tmdbID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: "Invalid tmdb id",
		})
	}

	// Find the movie by TMDb ID in the database
	movie, err := db.FindMovieByTmdbID(tmdbID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to find movie by TMDb ID")
		return c.Status(http.StatusNotFound).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusNotFound),
			Message: "Movie not found",
		})
	}

	// Log the movie streaming information
	log.Info().Msgf("Streaming: %s", movie.Location)

	return movieStreamDirect(c, movie.Location)
}
