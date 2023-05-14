package models

type SearchQueryParams struct {
	Limit int    `json:"limit,omitempty" validate:"gte=1" default:"1"`
	Page  int    `json:"page,omitempty" validate:"gte=1" default:"1"`
	Query string `json:"query,omitempty"`
}
