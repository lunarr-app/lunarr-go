package util

import (
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGenerateAPIKey(t *testing.T) {
	apiKey, err := GenerateAPIKey(16)

	assert.NoError(t, err)
	assert.Equal(t, 32, len(apiKey))

	decodedKey, err := hex.DecodeString(apiKey)
	assert.NoError(t, err)
	assert.Equal(t, 16, len(decodedKey))
}
