package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	tmdb "github.com/lunarr-app/golang-tmdb"
	"gorm.io/gorm"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

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
			"results": []tmdb.MovieDetails{},
			"limit":   query.Limit,
			"page":    query.Page,
			"total":   0,
		})
	}

	// Find movies in the database based on query and pagination
	var movieList []tmdb.MovieDetails
	err = db.GormDB.Scopes(searchQuery).
		Order("title").
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
