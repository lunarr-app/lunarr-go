package util

import (
	"errors"
	"strconv"
	"strings"
)

// Range represents a range of values.
type Range struct {
	Start int
	End   int
}

// Result represents the result of range parsing.
type RangeParserResult struct {
	Ranges []Range
	Type   string
}

// Options represents the parsing options.
type RangeParserOptions struct {
	Combine bool
}

// ParseRange parses the "Range" header `str` relative to the given file `size`.
func ParseRange(size int, str string, options RangeParserOptions) (*RangeParserResult, error) {
	if str == "" {
		return nil, errors.New("argument str must be a non-empty string")
	}

	if len(str) <= 7 || str[:6] != "bytes=" {
		return nil, errors.New("invalid range header")
	}

	str = str[6:]
	rangeParts := strings.Split(str, ",")
	ranges := make([]Range, 0, len(rangeParts))

	for _, rangeStr := range rangeParts {
		rangeVals := strings.Split(rangeStr, "-")
		if len(rangeVals) != 2 {
			continue
		}

		start, err := strconv.Atoi(rangeVals[0])
		if err != nil {
			return nil, errors.New("invalid range header")
		}

		end, err := strconv.Atoi(rangeVals[1])
		if err != nil {
			end = size - 1
		}

		if start > end || end >= size {
			continue
		}

		ranges = append(ranges, Range{Start: start, End: end})
	}

	if len(ranges) < 1 {
		return nil, errors.New("unsatisfiable range header")
	}

	result := &RangeParserResult{
		Ranges: ranges,
		Type:   "bytes",
	}

	if options.Combine {
		result.CombineRanges()
	}

	return result, nil
}

// CombineRanges combines overlapping and adjacent ranges.
func (r *RangeParserResult) CombineRanges() {
	if len(r.Ranges) <= 1 {
		return
	}

	ordered := r.Ranges
	sortRangesByStart(ordered)

	j := 0
	for i := 1; i < len(ordered); i++ {
		rangeVal := ordered[i]
		current := &ordered[j]

		if rangeVal.Start > current.End+1 {
			j++
			ordered[j] = rangeVal
		} else if rangeVal.End > current.End {
			current.End = rangeVal.End
		}
	}

	r.Ranges = ordered[:j+1]
}

func sortRangesByStart(ranges []Range) {
	if len(ranges) <= 1 {
		return
	}

	for i := 0; i < len(ranges); i++ {
		minIndex := i

		for j := i + 1; j < len(ranges); j++ {
			if ranges[j].Start < ranges[minIndex].Start {
				minIndex = j
			}
		}

		if minIndex != i {
			ranges[i], ranges[minIndex] = ranges[minIndex], ranges[i]
		}
	}
}
