package models

type SearchQueryParams struct {
	Limit int    `json:"limit,omitempty" validate:"gte=1" default:"20"`
	Page  int    `json:"page,omitempty" validate:"gte=1" default:"1"`
	Title string `json:"title,omitempty" default:""`
	Year  string `json:"year,omitempty" default:""`
}
