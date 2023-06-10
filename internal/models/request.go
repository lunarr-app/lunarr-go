package models

type SearchQueryParamsFilter struct {
	Field string `json:"field,omitempty" validate:"oneof=title genres year"`
	Value string `json:"value,omitempty" validate:"required" default:""`
}

type SearchQueryParams struct {
	Limit   int                       `json:"limit,omitempty" validate:"gte=1" default:"20"`
	Page    int                       `json:"page,omitempty" validate:"gte=1" default:"1"`
	Search  string                    `json:"search,omitempty" default:""`
	Filters []SearchQueryParamsFilter `json:"filters,omitempty" validate:"dive"`
}
