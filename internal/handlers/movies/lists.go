package movies

import (
	"net/http"

	tmdb "github.com/cyruzin/golang-tmdb"
	"github.com/go-playground/validator/v10"
	"github.com/kataras/iris/v12"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func ListsHandler(ctx iris.Context) {
	var query models.SearchQueryParams
	if err := ctx.ReadQuery(&query); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
		return
	}

	// Validate user input
	validate := validator.New()
	if err := validate.Struct(query); err != nil {
		ctx.StopWithJSON(http.StatusBadRequest, iris.Map{
			"status":  http.StatusText(http.StatusBadRequest),
			"message": err.Error(),
		})
		return
	}

	// Build query object based on search query
	search := bson.M{}
	if query.Query != "" {
		search = bson.M{
			"$text": bson.M{
				"$search":             query.Query,
				"$caseSensitive":      false,
				"$diacriticSensitive": false,
			},
		}
	}

	// Find movies in the database based on query and pagination
	opts := options.Find().SetSort(bson.M{"title": 1})
	opts.SetSkip(int64(query.Limit * (query.Page - 1)))
	opts.SetLimit(int64(query.Limit))

	totalMovies, err := db.MoviesLists.CountDocuments(ctx.Request().Context(), search)
	if err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to count movies",
		})
		return
	}

	cur, err := db.MoviesLists.Find(ctx.Request().Context(), search, opts)
	if err != nil {
		ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
			"status":  http.StatusText(http.StatusInternalServerError),
			"message": "Failed to find movies",
		})
		return
	}

	var movieList []tmdb.MovieDetails
	for cur.Next(ctx.Request().Context()) {
		var movie tmdb.MovieDetails
		if err := cur.Decode(&movie); err != nil {
			ctx.StopWithJSON(http.StatusInternalServerError, iris.Map{
				"status":  http.StatusText(http.StatusInternalServerError),
				"message": "Failed to decode movie",
			})
			return
		}
		movieList = append(movieList, movie)
	}

	ctx.StatusCode(http.StatusOK)
	ctx.JSON(map[string]interface{}{
		"results": movieList,
		"limit":   query.Limit,
		"page":    query.Page,
		"total":   int(totalMovies)/query.Limit + 1,
	})
}
