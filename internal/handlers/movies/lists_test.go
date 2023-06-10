package movies

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/handlers"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func TestListsHandler(t *testing.T) {
	config.InitConfig()
	db.InitDatabase()

	app := fiber.New()

	app.Get("/api/movies", ListsHandler)

	// Mock the request
	req := httptest.NewRequest(http.MethodGet, "/api/movies?limit=20&page=1", nil)
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, -1)

	// Assert that there's no error during the request
	assert.NoError(t, err)

	// Assert the response status code
	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Decode the response body
	var response handlers.ListsResponse
	err = json.NewDecoder(res.Body).Decode(&response)

	// Assert that there's no error during the decoding
	assert.NoError(t, err)

	// Assert the expected response values
	expectedResponse := handlers.ListsResponse{
		Results:     []models.MovieWithFiles{},
		Limit:       20,
		CurrentPage: 1,
		TotalPage:   0,
	}
	assert.Equal(t, expectedResponse, response)
}
