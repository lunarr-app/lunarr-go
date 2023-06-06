package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// movieStreamDirect handles the direct movie streaming request.
func movieStreamDirect(c *fiber.Ctx, path string) error {
	err := c.SendFile(path)
	if err != nil {
		util.Logger.Error().Err(err).Msg("Failed to send file for streaming")
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to send file for streaming",
		})
	}

	return nil
}
