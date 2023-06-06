package tmdb

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetImageURL(t *testing.T) {
	path := "/path/to/image.jpg"
	expectedURL := "https://image.tmdb.org/t/p/w500/path/to/image.jpg"

	actualURL := GetImageURL(path)

	assert.Equal(t, expectedURL, actualURL)
}

func TestFormatReleaseDate(t *testing.T) {
	date := "2023-05-10"
	expectedFormattedDate := "2023"

	actualFormattedDate := FormatReleaseDate(date)

	assert.Equal(t, expectedFormattedDate, actualFormattedDate)
}
