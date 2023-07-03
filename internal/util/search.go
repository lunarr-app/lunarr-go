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

		switch query.SortBy {
		case "recent":
			db = db.Order("created_at DESC")
		case "latest":
			db = db.Order("metadata_release_date DESC")
		case "popular":
			db = db.Order("metadata_vote_average DESC, metadata_vote_count DESC")
		default:
			db = db.Order("tmdb_id ASC")
		}

		return db
	}
}
