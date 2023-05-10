package common

import (
	"crypto/rand"
	"encoding/hex"
)

// GenerateAPIKey generates a random API key of the specified number of bytes
// or the default number of bytes (32) if not specified.
func GenerateAPIKey(numBytes ...int) (string, error) {
	n := 32
	if len(numBytes) > 0 {
		n = numBytes[0]
	}

	key := make([]byte, n)
	if _, err := rand.Read(key); err != nil {
		return "", err
	}

	return hex.EncodeToString(key), nil
}
