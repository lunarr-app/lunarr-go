package db

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
)

func TestFindMovieMetadata(t *testing.T) {
	config.InitConfig()
	tmdb.InitTMDBClient()
	InitDatabase()

	// Set up a movie ID for testing
	tmdbID := 278

	// Call the function under test
	movieData, err := FindMovieMetadata(tmdbID)

	// Check for any errors
	assert.NoError(t, err)

	// Ensure movie data is not nil
	assert.NotNil(t, movieData)
	assert.Equal(t, int64(tmdbID), movieData.ID)
	assert.NotNil(t, movieData.Title)
}
