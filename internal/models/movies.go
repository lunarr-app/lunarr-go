package models

import (
	TMDb "github.com/lunarr-app/golang-tmdb"
	"gorm.io/gorm"
)

type MovieWithFiles struct {
	gorm.Model
	Movie TMDb.MovieDetails `gorm:"embedded" json:"movie"`
	Files []string          `gorm:"type:text[]" json:"files"`
}
