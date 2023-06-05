package db

import (
	"testing"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/stretchr/testify/assert"
)

func TestInsertMovie(t *testing.T) {
	config.InitConfig()
	tmdb.InitTMDBClient()
	InitDatabase()

	// Retrieve the movie details from the TMDb API
	movieID := 603692
	movie, err := tmdb.TmdbClient.GetMovieDetails(movieID, nil)
	assert.NoError(t, err)

	// Define a sample file path
	filePath := "/path/to/movie.mp4"

	// Insert the movie into the database
	err = InsertMovie(movie, filePath)
	assert.NoError(t, err)

	// Check if the movie exists
	exists := CheckMovieExists(filePath)
	assert.True(t, exists)

	// Retrieve the inserted movie from the database
	insertedMovie, err := FindMovieByTmdbID(movieID)
	assert.NoError(t, err)
	assert.NotNil(t, insertedMovie)

	// Verify fields of the inserted movie
	assert.Equal(t, movieID, insertedMovie.TMDbID)
	assert.Equal(t, filePath, insertedMovie.Location)

	// Clean up the movie from the database
	err = DeleteMovieByTmdbID(movieID)
	assert.NoError(t, err)

	// Check if the movie exists after deletion
	exists = CheckMovieExists(filePath)
	assert.False(t, exists)
}
