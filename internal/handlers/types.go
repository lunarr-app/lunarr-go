package handlers

import "github.com/lunarr-app/lunarr-go/internal/models"

type ListsResponse struct {
	Results     []MovieWithFiles `json:"results"`
	Limit       int              `json:"limit"`
	CurrentPage int              `json:"page_current"`
	TotalPage   int              `json:"page_total"`
}

type ErrorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

type MovieWithFiles struct {
	TMDbID              int32                      `gorm:"column:tmdb_id" json:"tmdb_id"`
	Location            string                     `gorm:"column:location" json:"location"`
	Metadata            models.MovieMetadata       `gorm:"embedded;embeddedPrefix:metadata_" json:"metadata"`
	BelongsToCollection models.BelongsToCollection `gorm:"embedded;embeddedPrefix:collection_" json:"belongs_to_collection"`
}
