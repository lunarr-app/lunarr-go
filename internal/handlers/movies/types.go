package movies

type ListsResponse struct {
	Results []MovieDetails `json:"results"`
	Limit   int            `json:"limit"`
	Page    int            `json:"page"`
	Total   int            `json:"total"`
}

type MovieDetails struct {
	TMDbID   int32         `json:"tmdb_id"`
	Location string        `json:"location"`
	Metadata MovieMetadata `json:"metadata"`
}

type MovieMetadata struct {
	Adult               bool                    `json:"adult"`
	BackdropPath        string                  `json:"backdrop_path"`
	BelongsToCollection TMDbBelongsToCollection `json:"belongs_to_collection"`
	Genres              []TMDbGenre             `json:"genres"`
	Homepage            string                  `json:"homepage"`
	IMDbID              string                  `json:"imdb_id"`
	OriginalLanguage    string                  `json:"original_language"`
	OriginalTitle       string                  `json:"original_title"`
	Overview            string                  `json:"overview"`
	Popularity          float32                 `json:"popularity"`
	PosterPath          string                  `json:"poster_path"`
	ReleaseDate         string                  `json:"release_date"`
	Revenue             int64                   `json:"revenue"`
	Runtime             int                     `json:"runtime"`
	SpokenLanguages     []TMDbSpokenLanguage    `json:"spoken_languages"`
	Status              string                  `json:"status"`
	Tagline             string                  `json:"tagline"`
	Title               string                  `json:"title"`
	Video               bool                    `json:"video"`
	VoteAverage         float32                 `json:"vote_average"`
	VoteCount           int64                   `json:"vote_count"`
}

type TMDbGenre struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type TMDbSpokenLanguage struct {
	Iso639_1 string `json:"iso_639_1"`
	Name     string `json:"name"`
}

type TMDbBelongsToCollection struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	PosterPath   string `json:"poster_path"`
	BackdropPath string `json:"backdrop_path"`
}
