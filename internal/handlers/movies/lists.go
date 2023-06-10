package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// @Summary Get Movie Lists
// @Description Get a list of movies based on the search query and pagination parameters.
// @Tags movies
// @Accept json
// @Produce json
// @Param x-api-key header string true "API Key"
// @Param page query integer false "Page number" default(1)
// @Param limit query integer false "Number of movies per page" default(20)
// @Success 200 {object} ListsResponse
// @Failure 400 {object} handlers.ErrorResponse
// @Failure 500 {object} handlers.ErrorResponse
// @Router /api/movies [get]
func ListsHandler(c *fiber.Ctx) error {
	var query models.SearchQueryParams
	if err := c.QueryParser(&query); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
	}

	// Build search query
	searchQuery := util.BuildSearchQueryMovies(&query)

	// Count the total number of movies matching the search query
	var totalMovies int64
	err := db.GormDB.Model(&models.MovieWithFiles{}).Scopes(searchQuery).Count(&totalMovies).Error
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to count movies",
		})
	}

	// If no movies found, return an empty response
	if totalMovies == 0 {
		return c.Status(http.StatusOK).JSON(fiber.Map{
			"results": []models.MovieWithFiles{},
			"limit":   query.Limit,
			"page":    query.Page,
			"total":   0,
		})
	}

	// Find movies in the database based on query and pagination
	var movieList []models.MovieWithFiles
	err = db.GormDB.Scopes(searchQuery).
		Order("tmdb_id").
		Limit(query.Limit).
		Offset((query.Page - 1) * query.Limit).
		Find(&movieList).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to find movies",
		})
	}

	return c.Status(http.StatusOK).JSON(fiber.Map{
		"results": movieList,
		"limit":   query.Limit,
		"page":    query.Page,
		"total":   int(totalMovies)/query.Limit + 1,
	})
}
