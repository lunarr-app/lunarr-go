package models

import (
	"time"
)

type WatchHistoryMovies struct {
	BaseModel
	UserID         string    `json:"user_id"`
	TmdbID         string    `json:"tmdb_id"`
	WatchCount     int       `json:"watch_count"`
	CurrentRuntime float64   `json:"current_runtime"`
	WatchedAt      time.Time `json:"watched_at"`
}
