package scanner

import (
	"path/filepath"
	"strings"
)

// List of valid video file extensions
var videoExtensions = []string{".mp4", ".mov", ".avi", ".mkv", ".webm"}

// Check if the file has a valid video extension
func IsValidVideoFile(path string) bool {
	extension := strings.ToLower(filepath.Ext(path))
	for _, ext := range videoExtensions {
		if extension == ext {
			return true
		}
	}
	return false
}
