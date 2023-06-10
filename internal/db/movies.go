package db

import (
	TMDb "github.com/lunarr-app/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func CountMovies() int64 {
	var count int64
	GormDB.Model(&models.MovieWithFiles{}).Count(&count)
	return count
}

func CheckMovieExists(filePath string) bool {
	var count int64
	GormDB.Model(&models.MovieWithFiles{}).Where("location = ?", filePath).Count(&count)
	return count > 0
}

func FindMovieByTmdbID(tmdbID int) (*models.MovieWithFiles, error) {
	var movie models.MovieWithFiles
	err := GormDB.Where("tmdb_id = ?", tmdbID).First(&movie).Error
	if err != nil {
		return nil, err
	}

	return &movie, nil
}

func DeleteMovieByTmdbID(tmdbID int) error {
	err := GormDB.Delete(&models.MovieWithFiles{}, "tmdb_id = ?", tmdbID).Error
	if err != nil {
		return err
	}

	return nil
}

func InsertMovie(movie *TMDb.MovieDetails, path string) error {
	movieWithFiles := models.MovieWithFiles{
		TMDbID:   int32(movie.ID),
		Location: path,
		Metadata: models.MovieMetadata{
			Adult:            movie.Adult,
			BackdropPath:     movie.BackdropPath,
			Genres:           []models.TMDbGenre{},
			Homepage:         movie.Homepage,
			IMDbID:           movie.IMDbID,
			OriginalLanguage: movie.OriginalLanguage,
			OriginalTitle:    movie.OriginalTitle,
			Overview:         movie.Overview,
			Popularity:       movie.Popularity,
			PosterPath:       movie.PosterPath,
			ReleaseDate:      movie.ReleaseDate,
			Revenue:          movie.Revenue,
			Runtime:          movie.Runtime,
			SpokenLanguages:  []models.TMDbSpokenLanguage{},
			Status:           movie.Status,
			Tagline:          movie.Tagline,
			Title:            movie.Title,
			Video:            movie.Video,
			VoteAverage:      movie.VoteAverage,
			VoteCount:        movie.VoteCount,
		},
		BelongsToCollection: models.BelongsToCollection{
			ID:           int64(movie.BelongsToCollection.ID),
			Name:         movie.BelongsToCollection.Name,
			PosterPath:   movie.BelongsToCollection.PosterPath,
			BackdropPath: movie.BelongsToCollection.BackdropPath,
		},
	}

	// Convert genres to MovieGenre slice
	for _, genre := range movie.Genres {
		movieWithFiles.Metadata.Genres = append(movieWithFiles.Metadata.Genres, models.TMDbGenre{
			GenreID: int64(genre.ID),
			Name:    genre.Name,
		})
	}

	// Convert spoken languages to MovieSpokenLanguage slice
	for _, language := range movie.SpokenLanguages {
		movieWithFiles.Metadata.SpokenLanguages = append(movieWithFiles.Metadata.SpokenLanguages, models.TMDbSpokenLanguage{
			Iso639_1: language.Iso639_1,
			Name:     language.Name,
		})
	}

	// Create the movie record in SQLite
	err := GormDB.Create(&movieWithFiles).Error
	if err != nil {
		return err
	}

	return nil
}
