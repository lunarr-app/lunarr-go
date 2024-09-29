package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"gorm.io/gorm"
)

// @Summary Get Movie Details by ID
// @Description Get movie details by ID.
// @Tags movies
// @Accept json
// @Produce json
// @Param tmdb_id path integer true "Movie ID"
// @Success 200 {object} models.MovieWithFiles
// @Failure 400 {object} schema.ErrorResponse
// @Failure 404 {object} schema.ErrorResponse
// @Failure 500 {object} schema.ErrorResponse
// @Security ApiKeyAuth
// @Security ApiKeyQuery
// @Router /api/movies/{tmdb_id} [get]
func MovieByIDHandler(c *fiber.Ctx) error {
	// Get the movie ID from the URL parameter
	movieID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: "Invalid movie ID",
		})
	}

	// Find movie by ID in the database
	movie, err := db.FindMovieByTmdbID(movieID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return c.Status(http.StatusNotFound).JSON(schema.ErrorResponse{
				Status:  http.StatusText(http.StatusNotFound),
				Message: "Movie not found",
			})
		}

		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: err.Error(),
		})
	}

	// Return the movie object
	return c.Status(http.StatusOK).JSON(movie)
}
