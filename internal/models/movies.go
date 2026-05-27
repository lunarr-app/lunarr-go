package models

type MovieWithFiles struct {
	BaseModel
	TMDbID              int32               `json:"tmdb_id"`
	Location            string              `json:"location"`
	Metadata            MovieMetadata       `json:"metadata"`
	BelongsToCollection BelongsToCollection `json:"belongs_to_collection"`
}

type MovieMetadata struct {
	Adult            bool                 `json:"adult"`
	BackdropPath     string               `json:"backdrop_path"`
	Genres           []TMDbGenre          `json:"genres"`
	Homepage         string               `json:"homepage"`
	IMDbID           string               `json:"imdb_id"`
	OriginalLanguage string               `json:"original_language"`
	OriginalTitle    string               `json:"original_title"`
	Overview         string               `json:"overview"`
	Popularity       float32              `json:"popularity"`
	PosterPath       string               `json:"poster_path"`
	ReleaseDate      string               `json:"release_date"`
	Revenue          int64                `json:"revenue"`
	Runtime          int                  `json:"runtime"`
	SpokenLanguages  []TMDbSpokenLanguage `json:"spoken_languages"`
	Status           string               `json:"status"`
	Tagline          string               `json:"tagline"`
	Title            string               `json:"title"`
	Video            bool                 `json:"video"`
	VoteAverage      float32              `json:"vote_average"`
	VoteCount        int64                `json:"vote_count"`
}

type BelongsToCollection struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	PosterPath   string `json:"poster_path"`
	BackdropPath string `json:"backdrop_path"`
}
