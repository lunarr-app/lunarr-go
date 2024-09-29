package router

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/rs/zerolog/log"
)

func RootRedirect(c *fiber.Ctx) error {
	return c.Redirect("/app/movies", http.StatusFound)
}

func MoviePage(c *fiber.Ctx) error {
	// Retrieve popular movies from TMDb
	popularMovies, err := tmdb.TmdbClient.GetMoviePopular(nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to get popular movies from TMDb")
		c.Status(http.StatusInternalServerError)
		return InternalServerErrorPage(c)
	}

	// Render the view template
	return c.Render("movies", fiber.Map{"movies": popularMovies.Results})
}

func MovieDetailsPage(c *fiber.Ctx) error {
	// Get the movie ID from the URL parameter
	movieID, err := c.ParamsInt("tmdb_id")
	if err != nil {
		log.Error().Err(err).Msg("Invalid movie ID")
		c.Status(http.StatusBadRequest)
		// return BadRequestPage(c)
		return nil
	}

	// Retrieve movie details from TMDb
	movieDetails, err := tmdb.TmdbClient.GetMovieDetails(movieID, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to get movie details from TMDb")
		c.Status(http.StatusInternalServerError)
		return InternalServerErrorPage(c)
	}

	// Render the view template
	return c.Render("movie-details", fiber.Map{"Movie": movieDetails})
}
