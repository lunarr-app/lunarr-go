package models

type TMDbGenre struct {
	BaseModel
	GenreID int64  `json:"id"`
	Name    string `json:"name"`
}

type TMDbSpokenLanguage struct {
	BaseModel
	Iso639_1 string `json:"iso_639_1"`
	Name     string `json:"name"`
}
