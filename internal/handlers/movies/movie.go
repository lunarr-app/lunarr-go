package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"gorm.io/gorm"
)

// @Summary Get Movie Details by ID
// @Description Get movie details by ID.
// @Tags movies
// @Accept json
// @Produce json
// @Param x-api-key header string true "API Key"
// @Param id path integer true "Movie ID"
// @Success 200 {object} models.MovieWithFiles
// @Failure 400 {object} schema.ErrorResponse
// @Failure 500 {object} schema.ErrorResponse
// @Router /api/movies/{id} [get]
func MovieByIDHandler(c *fiber.Ctx) error {
	// Get the movie ID from the URL parameter
	movieID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Find movie by ID in the database
	movie, err := db.FindMovieByTmdbID(movieID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{
				"status":  http.StatusText(http.StatusNotFound),
				"message": "Movie not found",
			})
		}

		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": err.Error(),
		})
	}

	return c.Status(http.StatusOK).JSON(movie)
}
