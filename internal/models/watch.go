package models

import (
	"time"
)

type WatchHistoryMovies struct {
	GormModel
	UserID         string    `json:"user_id" gorm:"column:user_id;index;not null"`
	TmdbID         string    `json:"tmdb_id" gorm:"column:tmdb_id;index;not null"`
	WatchCount     int       `json:"watch_count" gorm:"column:watch_count"`
	CurrentRuntime float64   `json:"current_runtime" gorm:"column:current_runtime"`
	WatchedAt      time.Time `json:"watched_at" gorm:"column:watched_at"`
}
