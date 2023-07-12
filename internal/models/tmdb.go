package models

type TMDbGenre struct {
	GormModel
	GenreID int64  `gorm:"column:genre_id" json:"id"`
	Name    string `gorm:"column:genre_name" json:"name"`
}

type TMDbSpokenLanguage struct {
	GormModel
	Iso639_1 string `gorm:"column:language_iso639_1" json:"iso_639_1"`
	Name     string `gorm:"column:language_name" json:"name"`
}
