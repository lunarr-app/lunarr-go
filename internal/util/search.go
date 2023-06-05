package util

import (
	"github.com/lunarr-app/lunarr-go/internal/models"
	"gorm.io/gorm"
)

// BuildSearchQueryMovies is a scope function that builds the search query for GORM
// based on the provided SearchQueryParams.
func BuildSearchQueryMovies(query *models.SearchQueryParams) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if query.Search != "" {
			db = db.Where("title ILIKE ?", "%"+query.Search+"%")
		}

		for _, filter := range query.Filters {
			switch filter.Field {
			case "title":
				db = db.Where("title ILIKE ?", "%"+filter.Value+"%")
			case "genres":
				db = db.Where("genres @> ARRAY[?]", filter.Value)
			case "year":
				db = db.Where("release_date::text ILIKE ?", filter.Value+"%")
			}
		}

		return db
	}
}
