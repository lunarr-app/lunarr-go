package scanner

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
)

func TestScanMediaDirectory(t *testing.T) {
	config.InitConfig()
	tmdb.InitTMDBClient()
	db.InitDatabase()

	// Create a temporary directory for the test
	tempDir := t.TempDir()

	// Create sample movie files in the temporary directory
	createSampleFiles(t, tempDir)

	// Scan the media directory
	ScanMediaDirectory(tempDir)

	// Verify the database insertions
	assert.Equal(t, int64(3), db.CountMovies())

	// Verify the expected movie data
	expectedMovies := []models.MovieWithFiles{
		{
			TMDbID:   157336,
			Location: filepath.Join(tempDir, "Interstellar (2014) [1080p].mp4"),
		},
		{
			TMDbID:   27205,
			Location: filepath.Join(tempDir, "Inception (2010) [720p].mp4"),
		},
		{
			TMDbID:   155,
			Location: filepath.Join(tempDir, "The Dark Knight (2008) [1080p].mp4"),
		},
	}

	for _, movie := range expectedMovies {
		m, err := db.FindMovieByTmdbID(int(movie.TMDbID))
		assert.NoError(t, err)
		assert.Equal(t, int32(movie.TMDbID), m.TMDbID)
		assert.Equal(t, movie.Location, m.Location)
	}

}

// Helper function to create sample movie files with data similar to torrent files
func createSampleFiles(t *testing.T, directory string) {
	// Create sample movie files
	createMovieFile(t, directory, "Interstellar (2014) [1080p]", "Sample movie content 1")
	createMovieFile(t, directory, "Inception (2010) [720p]", "Sample movie content 2")
	createMovieFile(t, directory, "The Dark Knight (2008) [1080p]", "Sample movie content 3")
}

// Helper function to create a movie file with the given name and content
func createMovieFile(t *testing.T, directory, name, content string) {
	filename := name + ".mp4"
	path := filepath.Join(directory, filename)
	file, err := os.Create(path)
	assert.NoError(t, err)
	defer file.Close()

	_, err = file.WriteString(content)
	assert.NoError(t, err)
}
