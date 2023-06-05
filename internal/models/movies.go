package models

import (
	"gorm.io/gorm"
)

type MovieWithFiles struct {
	gorm.Model
	TMDbID int64    `gorm:"column:tmdb_id" json:"tmdb_id"`
	Files  []string `gorm:"type:text[]" json:"files"`
}
