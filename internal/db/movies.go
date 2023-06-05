package db

import (
	TMDb "github.com/lunarr-app/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func CheckMovieExists(filePath string) bool {
	var count int64
	DB.Model(&models.MovieWithFiles{}).Where("files = ?", filePath).Count(&count)
	return count > 0
}

func InsertMovie(movie *TMDb.MovieDetails, file string) error {
	movieWithFiles := models.MovieWithFiles{
		TMDbID: movie.ID,
		Files:  []string{file},
	}

	err := DB.Create(&movieWithFiles).Error
	if err != nil {
		return err
	}

	return nil
}

func FindMovieByTmdbID(tmdbID int) (*models.MovieWithFiles, error) {
	var movie models.MovieWithFiles
	err := DB.Where("movie.id = ?", tmdbID).First(&movie).Error
	if err != nil {
		return nil, err
	}

	return &movie, nil
}

func DeleteMovieByTmdbID(tmdbID int) error {
	err := DB.Delete(&models.MovieWithFiles{}, "movie.id = ?", tmdbID).Error
	if err != nil {
		return err
	}

	return nil
}
