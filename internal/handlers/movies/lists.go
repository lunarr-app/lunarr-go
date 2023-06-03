package movies

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	tmdb "github.com/lunarr-app/golang-tmdb"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

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

	// Build query object based on search query and filters
	search := util.BuildSearchQuery(&query)

	// Find movies in the database based on query and pagination
	opts := options.Find().SetSort(bson.M{"title": 1})
	opts.SetSkip(int64(query.Limit * (query.Page - 1)))
	opts.SetLimit(int64(query.Limit))

	totalMovies, err := db.MoviesLists.CountDocuments(c.Context(), search)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to count movies",
		})
	}

	cur, err := db.MoviesLists.Find(c.Context(), search, opts)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to find movies",
		})
	}

	var movieList []tmdb.MovieDetails
	for cur.Next(c.Context()) {
		var movie tmdb.MovieDetails
		if err := cur.Decode(&movie); err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{
				"status":  http.StatusText(http.StatusInternalServerError),
				"message": "Failed to decode movie",
			})
		}
		movieList = append(movieList, movie)
	}

	return c.Status(http.StatusOK).JSON(fiber.Map{
		"results": movieList,
		"limit":   query.Limit,
		"page":    query.Page,
		"total":   int(totalMovies)/query.Limit + 1,
	})
}
