package models

import "github.com/go-playground/validator/v10"

type SearchQueryParams struct {
	Limit  int    `json:"limit" validate:"required,gte=1" default:"20"`
	Page   int    `json:"page" validate:"required,gte=1" default:"1"`
	Title  string `json:"title,omitempty" default:""`
	Year   string `json:"year,omitempty" default:""`
	SortBy string `json:"sortBy,omitempty" validate:"omitempty,oneof=recent latest popular"`
}

func (s *SearchQueryParams) Validate() error {
	validate := validator.New()
	return validate.Struct(s)
}
