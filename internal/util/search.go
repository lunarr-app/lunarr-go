package util

import (
	"fmt"

	"github.com/lunarr-app/lunarr-go/internal/models"
	"go.mongodb.org/mongo-driver/bson"
)

// BuildSearchQuery builds the search query based on search query and filters
func BuildSearchQuery(query *models.SearchQueryParams) bson.M {
	searchQuery := bson.M{}

	// Build text search query
	if query.Search != "" {
		searchQuery["$text"] = bson.M{
			"$search":             query.Search,
			"$caseSensitive":      false,
			"$diacriticSensitive": false,
		}
	}

	// Build field specific queries
	for _, filter := range query.Filters {
		switch filter.Field {
		case "title":
			searchQuery["title"] = bson.M{"$regex": filter.Value, "$options": "i"}
		case "genres":
			searchQuery["genres"] = bson.M{"$in": bson.A{filter.Value}}
		case "year":
			searchQuery["release_date"] = bson.M{"$regex": fmt.Sprintf("^%s", filter.Value), "$options": "i"}
		}
	}

	return searchQuery
}
