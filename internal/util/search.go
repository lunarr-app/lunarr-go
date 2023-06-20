package util

import (
	"strings"

	"github.com/lunarr-app/lunarr-go/internal/models"
	"gorm.io/gorm"
)

// BuildSearchQueryMovies is a scope function that builds the search query for GORM
// based on the provided SearchQueryParams.
func BuildSearchQueryMovies(query *models.SearchQueryParams) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if query.Title != "" {
			db = db.Where("LOWER(metadata_title) LIKE ?", "%"+strings.ToLower(query.Title)+"%")
		}

		if query.Year != "" {
			db = db.Where("metadata_release_date LIKE ?", query.Year+"%")
		}

		return db
	}
}
