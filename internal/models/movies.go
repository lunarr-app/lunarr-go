package models

import (
	"time"

	TMDb "github.com/lunarr-app/golang-tmdb"
)

type MovieWithFiles struct {
	Movie     *TMDb.MovieDetails `json:"movie" bson:"movie"`
	Files     []string           `json:"files" bson:"files"`
	CreatedAt time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt time.Time          `json:"updated_at" bson:"updated_at"`
}
