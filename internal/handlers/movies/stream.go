package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func MovieStreamHandler(c *fiber.Ctx) error {
	tmdbID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": "Invalid tmdb id",
		})
	}

	movie, err := db.FindMovieByTmdbID(tmdbID)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to find movie by TMDb ID")
		return c.Status(http.StatusNotFound).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusNotFound),
			"message": "Movie not found",
		})
	}

	util.Logger.Info().Msgf("Streaming: %s", movie.Location)

	// TODO: Implement partial content streaming here
	// For now, send the entire file
	err = c.SendFile(movie.Location)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to send file for streaming")
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to send file for streaming",
		})
	}

	return nil
}
