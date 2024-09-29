package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/schema"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

// @Summary Get Movie Lists
// @Description Get a list of movies based on the search query and pagination parameters.
// @Tags movies
// @Accept json
// @Produce json
// @Param page query integer true "Page number" default(1)
// @Param limit query integer true "Number of movies per page" default(20)
// @Param title query string false "Search by movie title"
// @Param year query string false "Search by movie release year"
// @Param sortBy query string false "Sort by: recent, latest, popular" default("recent")
// @Success 200 {object} schema.ListsResponse
// @Failure 400 {object} schema.ErrorResponse
// @Failure 500 {object} schema.ErrorResponse
// @Security ApiKeyAuth
// @Security ApiKeyQuery
// @Router /api/movies [get]
func MovieRootHandler(c *fiber.Ctx) error {
	var query models.SearchQueryParams
	if err := c.QueryParser(&query); err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	// Validate search query input
	if err := query.Validate(); err != nil {
		return c.Status(http.StatusBadRequest).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusBadRequest),
			Message: err.Error(),
		})
	}

	// Build search query
	searchQuery := util.BuildSearchQueryMovies(&query)

	// Count the total number of movies matching the search query
	var totalMovies int64
	err := db.GormDB.Model(&models.MovieWithFiles{}).Scopes(searchQuery).Count(&totalMovies).Error
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to count movies",
		})
	}

	// If no movies found, return an empty response
	if totalMovies == 0 {
		return c.Status(http.StatusOK).JSON(schema.ListsResponse{
			Results:     []models.MovieWithFiles{},
			Limit:       query.Limit,
			CurrentPage: query.Page,
			TotalPage:   0,
		})
	}

	// Find movies in the database based on query and pagination
	var movieList []models.MovieWithFiles
	err = db.GormDB.Scopes(searchQuery).
		Limit(query.Limit).
		Offset((query.Page - 1) * query.Limit).
		Find(&movieList).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return c.Status(http.StatusInternalServerError).JSON(schema.ErrorResponse{
			Status:  http.StatusText(http.StatusInternalServerError),
			Message: "Failed to find movies",
		})
	}

	return c.Status(http.StatusOK).JSON(schema.ListsResponse{
		Results:     movieList,
		Limit:       query.Limit,
		CurrentPage: query.Page,
		TotalPage:   int(totalMovies)/query.Limit + 1,
	})
}
