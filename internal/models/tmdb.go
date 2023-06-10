package models

import "gorm.io/gorm"

type TMDbGenre struct {
	gorm.Model `swaggerignore:"true"`
	GenreID    int64  `gorm:"column:genre_id" json:"id"`
	Name       string `gorm:"column:genre_name" json:"name"`
}

type TMDbSpokenLanguage struct {
	gorm.Model `swaggerignore:"true"`
	Iso639_1   string `gorm:"column:language_iso639_1" json:"iso_639_1"`
	Name       string `gorm:"column:language_name" json:"name"`
}
