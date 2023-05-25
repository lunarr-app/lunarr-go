package util

import (
	"fmt"
	"testing"
)

func TestParseRange(t *testing.T) {
	size := 1000
	rangeHeader := "bytes=0-499,500-999"

	// Test case for combined ranges
	optionsCombine := RangeParserOptions{Combine: true}
	resultCombine, errCombine := ParseRange(size, rangeHeader, optionsCombine)
	if errCombine != nil {
		t.Errorf("Error parsing range with combine option: %s", errCombine.Error())
	}

	fmt.Printf("Combined Range Type: %s\n", resultCombine.Type)

	for i, rangeItem := range resultCombine.Ranges {
		fmt.Printf("Combined Range %d: start=%d, end=%d\n", i+1, rangeItem.Start, rangeItem.End)
	}

	// Test case for non-combined ranges
	optionsNonCombine := RangeParserOptions{Combine: false}
	resultNonCombine, errNonCombine := ParseRange(size, rangeHeader, optionsNonCombine)
	if errNonCombine != nil {
		t.Errorf("Error parsing range without combine option: %s", errNonCombine.Error())
	}

	fmt.Printf("Non-Combined Range Type: %s\n", resultNonCombine.Type)

	for i, rangeItem := range resultNonCombine.Ranges {
		fmt.Printf("Non-Combined Range %d: start=%d, end=%d\n", i+1, rangeItem.Start, rangeItem.End)
	}

	// Test case for a failed range parsing
	invalidRangeHeader := "bytes=500-20"
	invalidResult, invalidErr := ParseRange(size, invalidRangeHeader, optionsCombine)
	if invalidErr == nil {
		t.Error("Expected an error, but parsing succeeded")
	} else {
		fmt.Println("Invalid Range Header Error:", invalidErr)
		fmt.Println("Invalid Result:", invalidResult)
	}
}
