package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"github.com/rs/zerolog/log"
)

// movieStreamDirect handles the direct movie streaming request.
func movieStreamDirect(c *fiber.Ctx, path string) error {
	err := c.SendFile(path)
	if err != nil {
		log.Error().Err(err).Msg("Failed to send file for streaming")
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to send file for streaming",
		})
	}

	return nil
}
