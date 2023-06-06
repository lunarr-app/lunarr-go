package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// MovieStreamHandler handles the movie streaming request.
func MovieStreamHandler(c *fiber.Ctx) error {
	// Get the tmdb_id parameter from the request
	tmdbID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Invalid tmdb id",
		})
	}

	// Find the movie by TMDb ID in the database
	movie, err := db.FindMovieByTmdbID(tmdbID)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to find movie by TMDb ID")
		return c.Status(http.StatusNotFound).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusNotFound),
			"message": "Movie not found",
		})
	}

	// Log the movie streaming information
	util.Logger.Info().Msgf("Streaming: %s", movie.Location)

	// TODO: Implement transcode-based streaming later.
	return movieStreamDirect(c, movie)
}
