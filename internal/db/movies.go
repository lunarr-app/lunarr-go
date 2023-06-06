package db

import (
	TMDb "github.com/lunarr-app/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func CountMovies() int64 {
	var count int64
	DB.Model(&models.MovieWithFiles{}).Count(&count)
	return count
}

func CheckMovieExists(filePath string) bool {
	var count int64
	DB.Model(&models.MovieWithFiles{}).Where("location = ?", filePath).Count(&count)
	return count > 0
}

func InsertMovie(movie *TMDb.MovieDetails, path string) error {
	movieWithFiles := models.MovieWithFiles{
		TMDbID:   int32(movie.ID),
		Location: path,
	}

	err := DB.Create(&movieWithFiles).Error
	if err != nil {
		return err
	}

	return nil
}

func FindMovieByTmdbID(tmdbID int) (*models.MovieWithFiles, error) {
	var movie models.MovieWithFiles
	err := DB.Where("tmdb_id = ?", tmdbID).First(&movie).Error
	if err != nil {
		return nil, err
	}

	return &movie, nil
}

func DeleteMovieByTmdbID(tmdbID int) error {
	err := DB.Delete(&models.MovieWithFiles{}, "tmdb_id = ?", tmdbID).Error
	if err != nil {
		return err
	}

	return nil
}
