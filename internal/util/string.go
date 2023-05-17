package util

import (
	"fmt"
	"strings"
)

// MaskSecret masks the provided secret by replacing all characters with '*'
// except for the first and last characters.
func MaskSecret(secret string) string {
	length := len(secret)
	if length > 2 {
		return fmt.Sprintf("%s%s%s", secret[0:1], strings.Repeat("*", length-2), secret[length-1:])
	}
	return secret
}
