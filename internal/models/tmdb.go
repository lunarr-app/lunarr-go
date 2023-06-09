package models

import "gorm.io/gorm"

type TMDbGenre struct {
	gorm.Model
	ID   int64  `gorm:"column:genre_id" json:"id"`
	Name string `gorm:"column:genre_name" json:"name"`
}

type TMDbSpokenLanguage struct {
	gorm.Model
	Iso639_1 string `gorm:"column:language_iso639_1" json:"iso_639_1"`
	Name     string `gorm:"column:language_name" json:"name"`
}

type TMDbBelongsToCollection struct {
	gorm.Model
	ID           int64  `gorm:"column:collection_id" json:"id"`
	Name         string `gorm:"column:collection_name" json:"name"`
	PosterPath   string `gorm:"column:collection_poster" json:"poster_path"`
	BackdropPath string `gorm:"column:collection_backdrop" json:"backdrop_path"`
}
