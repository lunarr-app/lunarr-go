package handlers

import "github.com/lunarr-app/lunarr-go/internal/models"

type ListsResponse struct {
	Results     []models.MovieWithFiles `json:"results"`
	Limit       int                     `json:"limit"`
	CurrentPage int                     `json:"page_current"`
	TotalPage   int                     `json:"page_total"`
}

type ErrorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}
