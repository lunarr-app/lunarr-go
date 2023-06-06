package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// movieStreamDirect handles the direct movie streaming request.
func movieStreamDirect(c *fiber.Ctx, movie *models.MovieWithFiles) error {
	// For now, send the entire file
	// We will handle better streaming support later
	err := c.SendFile(movie.Location)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to send file for streaming")
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to send file for streaming",
		})
	}

	return nil
}
