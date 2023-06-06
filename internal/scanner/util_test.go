package scanner

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsValidVideoFile(t *testing.T) {
	// Test with valid video file extensions
	validExtensions := videoExtensions
	for _, ext := range validExtensions {
		filePath := "/path/to/video" + ext
		isValid := IsValidVideoFile(filePath)
		assert.True(t, isValid, "Expected %s to be a valid video file", filePath)
	}

	// Test with invalid video file extensions
	invalidExtensions := []string{".txt", ".jpg", ".png", ".gif"}
	for _, ext := range invalidExtensions {
		filePath := "/path/to/file" + ext
		isValid := IsValidVideoFile(filePath)
		assert.False(t, isValid, "Expected %s to be an invalid video file", filePath)
	}

	// Test with mixed-case extension
	filePath := "/path/to/video.MKV"
	isValid := IsValidVideoFile(filePath)
	assert.True(t, isValid, "Expected %s to be a valid video file", filePath)

	// Test with file name without extension
	filePath = "/path/to/video"
	isValid = IsValidVideoFile(filePath)
	assert.False(t, isValid, "Expected %s to be an invalid video file", filePath)
}
