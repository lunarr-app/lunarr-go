package models

import (
	"time"

	TMDb "github.com/lunarr-app/golang-tmdb"
)

type MovieWithFiles struct {
	Movie     *TMDb.MovieDetails `bson:"movie"`
	Files     []string           `bson:"files"`
	CreatedAt time.Time          `bson:"created_at"`
	UpdatedAt time.Time          `bson:"updated_at"`
}
