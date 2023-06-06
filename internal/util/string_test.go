package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMaskSecret(t *testing.T) {
	// Test case: secret with more than 2 characters
	secret := "password123"
	expected := "p*********3"
	result := MaskSecret(secret)
	assert.Equal(t, expected, result, "Masked secret does not match expected value")

	// Test case: secret with 2 characters
	secret = "12"
	expected = "12"
	result = MaskSecret(secret)
	assert.Equal(t, expected, result, "Masked secret does not match expected value")

	// Test case: secret with 1 character
	secret = "!"
	expected = "!"
	result = MaskSecret(secret)
	assert.Equal(t, expected, result, "Masked secret does not match expected value")

	// Test case: empty secret
	secret = ""
	expected = ""
	result = MaskSecret(secret)
	assert.Equal(t, expected, result, "Masked secret does not match expected value")
}
