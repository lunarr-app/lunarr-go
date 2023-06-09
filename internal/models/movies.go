package models

import (
	"gorm.io/gorm"
)

type MovieWithFiles struct {
	gorm.Model
	TMDbID   int32         `gorm:"column:tmdb_id" json:"tmdb_id"`
	Location string        `gorm:"column:location" json:"location"`
	Metadata MovieMetadata `gorm:"embedded" json:"metadata"`
}

type MovieMetadata struct {
	Adult               bool                    `gorm:"column:adult" json:"adult"`
	BackdropPath        string                  `gorm:"column:backdrop_path" json:"backdrop_path"`
	BelongsToCollection TMDbBelongsToCollection `gorm:"foreignKey:collection_id" json:"belongs_to_collection"`
	Genres              []TMDbGenre             `gorm:"foreignKey:genre_id" json:"genres"`
	Homepage            string                  `gorm:"column:homepage" json:"homepage"`
	IMDbID              string                  `gorm:"column:imdb_id" json:"imdb_id"`
	OriginalLanguage    string                  `gorm:"column:original_language" json:"original_language"`
	OriginalTitle       string                  `gorm:"column:original_title" json:"original_title"`
	Overview            string                  `gorm:"column:overview" json:"overview"`
	Popularity          float32                 `gorm:"column:popularity" json:"popularity"`
	PosterPath          string                  `gorm:"column:poster_path" json:"poster_path"`
	ReleaseDate         string                  `gorm:"column:release_date" json:"release_date"`
	Revenue             int64                   `gorm:"column:revenue" json:"revenue"`
	Runtime             int                     `gorm:"column:runtime" json:"runtime"`
	SpokenLanguages     []TMDbSpokenLanguage    `gorm:"foreignKey:language_iso639_1" json:"spoken_languages"`
	Status              string                  `gorm:"column:status" json:"status"`
	Tagline             string                  `gorm:"column:tagline" json:"tagline"`
	Title               string                  `gorm:"column:title" json:"title"`
	Video               bool                    `gorm:"column:video" json:"video"`
	VoteAverage         float32                 `gorm:"column:vote_average" json:"vote_average"`
	VoteCount           int64                   `gorm:"column:vote_count" json:"vote_count"`
}
