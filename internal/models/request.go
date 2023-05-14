package models

type Filter struct {
	Field string `json:"field,omitempty" validate:"oneof=title genres year"`
	Value string `json:"value,omitempty" validate:"required" default:""`
}

type SearchQueryParams struct {
	Limit   int      `json:"limit,omitempty" validate:"gte=1" default:"1"`
	Page    int      `json:"page,omitempty" validate:"gte=1" default:"1"`
	Search  string   `json:"search,omitempty" default:""`
	Filters []Filter `json:"filters,omitempty" validate:"dive"`
}
