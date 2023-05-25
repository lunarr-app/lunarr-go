package util

import (
	"fmt"
	"testing"
)

func TestParseRange(t *testing.T) {
	size := 1000
	rangeHeader := "bytes=0-499,500-999"
	options := RangeParserOptions{Combine: true}

	result, err := ParseRange(size, rangeHeader, options)
	if err != nil {
		t.Errorf("Error parsing range: %s", err.Error())
	}

	fmt.Printf("Range Type: %s\n", result.Type)

	for i, rangeItem := range result.Ranges {
		fmt.Printf("Range %d: start=%d, end=%d\n", i+1, rangeItem.Start, rangeItem.End)
	}

	// Test case for a failed range parsing
	invalidRangeHeader := "bytes=500-20"
	invalidResult, invalidErr := ParseRange(size, invalidRangeHeader, options)
	if invalidErr == nil {
		t.Error("Expected an error, but parsing succeeded")
	} else {
		fmt.Println("Invalid Range Header Error:", invalidErr)
		fmt.Println("Invalid Result:", invalidResult)
	}
}
