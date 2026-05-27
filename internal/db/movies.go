package db

import (
	"context"

	entsql "entgo.io/ent/dialect/sql"
	TMDb "github.com/cyruzin/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/ent"
	"github.com/lunarr-app/lunarr-go/internal/ent/moviewithfile"
	"github.com/lunarr-app/lunarr-go/internal/models"
)

func CountMovies() int64 {
	count, _ := EntClient.MovieWithFile.Query().Count(context.Background())
	return int64(count)
}

func CheckMovieExists(filePath string) bool {
	exists, _ := EntClient.MovieWithFile.Query().
		Where(moviewithfile.LocationEQ(filePath)).
		Exist(context.Background())
	return exists
}

func FindMovieByTmdbID(tmdbID int) (*models.MovieWithFiles, error) {
	movie, err := EntClient.MovieWithFile.Query().
		Where(moviewithfile.TmdbIDEQ(int32(tmdbID))).
		Only(context.Background())
	if err != nil {
		return nil, err
	}

	return movieWithFileToModel(movie), nil
}

func DeleteMovieByTmdbID(tmdbID int) error {
	_, err := EntClient.MovieWithFile.Delete().
		Where(moviewithfile.TmdbIDEQ(int32(tmdbID))).
		Exec(context.Background())
	return err
}

func ListMovies(query *models.SearchQueryParams) ([]models.MovieWithFiles, int, error) {
	totalMovies, err := movieQuery(query).Count(context.Background())
	if err != nil {
		return nil, 0, err
	}
	if totalMovies == 0 {
		return []models.MovieWithFiles{}, 0, nil
	}

	movies, err := movieQuery(query).
		Limit(query.Limit).
		Offset((query.Page - 1) * query.Limit).
		All(context.Background())
	if err != nil {
		return nil, 0, err
	}

	result := make([]models.MovieWithFiles, 0, len(movies))
	for _, movie := range movies {
		result = append(result, *movieWithFileToModel(movie))
	}

	return result, totalMovies, nil
}

func InsertMovie(movie *TMDb.MovieDetails, path string) error {
	movieWithFiles := models.MovieWithFiles{
		TMDbID:   int32(movie.ID),
		Location: path,
		Metadata: models.MovieMetadata{
			Adult:            movie.Adult,
			BackdropPath:     movie.BackdropPath,
			Genres:           []models.TMDbGenre{},
			Homepage:         movie.Homepage,
			IMDbID:           movie.IMDbID,
			OriginalLanguage: movie.OriginalLanguage,
			OriginalTitle:    movie.OriginalTitle,
			Overview:         movie.Overview,
			Popularity:       movie.Popularity,
			PosterPath:       movie.PosterPath,
			ReleaseDate:      movie.ReleaseDate,
			Revenue:          movie.Revenue,
			Runtime:          movie.Runtime,
			SpokenLanguages:  []models.TMDbSpokenLanguage{},
			Status:           movie.Status,
			Tagline:          movie.Tagline,
			Title:            movie.Title,
			Video:            movie.Video,
			VoteAverage:      movie.VoteAverage,
			VoteCount:        movie.VoteCount,
		},
		BelongsToCollection: models.BelongsToCollection{
			ID:           int64(movie.BelongsToCollection.ID),
			Name:         movie.BelongsToCollection.Name,
			PosterPath:   movie.BelongsToCollection.PosterPath,
			BackdropPath: movie.BelongsToCollection.BackdropPath,
		},
	}

	// Convert genres to MovieGenre slice
	for _, genre := range movie.Genres {
		movieWithFiles.Metadata.Genres = append(movieWithFiles.Metadata.Genres, models.TMDbGenre{
			GenreID: int64(genre.ID),
			Name:    genre.Name,
		})
	}

	// Convert spoken languages to MovieSpokenLanguage slice
	for _, language := range movie.SpokenLanguages {
		movieWithFiles.Metadata.SpokenLanguages = append(movieWithFiles.Metadata.SpokenLanguages, models.TMDbSpokenLanguage{
			Iso639_1: language.Iso639_1,
			Name:     language.Name,
		})
	}

	_, err := EntClient.MovieWithFile.Create().
		SetTmdbID(movieWithFiles.TMDbID).
		SetLocation(movieWithFiles.Location).
		SetMetadataAdult(movieWithFiles.Metadata.Adult).
		SetMetadataBackdropPath(movieWithFiles.Metadata.BackdropPath).
		SetMetadataGenres(movieWithFiles.Metadata.Genres).
		SetMetadataHomepage(movieWithFiles.Metadata.Homepage).
		SetMetadataImdbID(movieWithFiles.Metadata.IMDbID).
		SetMetadataOriginalLanguage(movieWithFiles.Metadata.OriginalLanguage).
		SetMetadataOriginalTitle(movieWithFiles.Metadata.OriginalTitle).
		SetMetadataOverview(movieWithFiles.Metadata.Overview).
		SetMetadataPopularity(movieWithFiles.Metadata.Popularity).
		SetMetadataPosterPath(movieWithFiles.Metadata.PosterPath).
		SetMetadataReleaseDate(movieWithFiles.Metadata.ReleaseDate).
		SetMetadataRevenue(movieWithFiles.Metadata.Revenue).
		SetMetadataRuntime(movieWithFiles.Metadata.Runtime).
		SetMetadataSpokenLanguages(movieWithFiles.Metadata.SpokenLanguages).
		SetMetadataStatus(movieWithFiles.Metadata.Status).
		SetMetadataTagline(movieWithFiles.Metadata.Tagline).
		SetMetadataTitle(movieWithFiles.Metadata.Title).
		SetMetadataVideo(movieWithFiles.Metadata.Video).
		SetMetadataVoteAverage(movieWithFiles.Metadata.VoteAverage).
		SetMetadataVoteCount(movieWithFiles.Metadata.VoteCount).
		SetCollectionID(movieWithFiles.BelongsToCollection.ID).
		SetCollectionName(movieWithFiles.BelongsToCollection.Name).
		SetCollectionPosterPath(movieWithFiles.BelongsToCollection.PosterPath).
		SetCollectionBackdropPath(movieWithFiles.BelongsToCollection.BackdropPath).
		Save(context.Background())
	return err
}

func InsertMovieModel(movie *models.MovieWithFiles) error {
	created, err := EntClient.MovieWithFile.Create().
		SetTmdbID(movie.TMDbID).
		SetLocation(movie.Location).
		SetMetadataAdult(movie.Metadata.Adult).
		SetMetadataBackdropPath(movie.Metadata.BackdropPath).
		SetMetadataGenres(movie.Metadata.Genres).
		SetMetadataHomepage(movie.Metadata.Homepage).
		SetMetadataImdbID(movie.Metadata.IMDbID).
		SetMetadataOriginalLanguage(movie.Metadata.OriginalLanguage).
		SetMetadataOriginalTitle(movie.Metadata.OriginalTitle).
		SetMetadataOverview(movie.Metadata.Overview).
		SetMetadataPopularity(movie.Metadata.Popularity).
		SetMetadataPosterPath(movie.Metadata.PosterPath).
		SetMetadataReleaseDate(movie.Metadata.ReleaseDate).
		SetMetadataRevenue(movie.Metadata.Revenue).
		SetMetadataRuntime(movie.Metadata.Runtime).
		SetMetadataSpokenLanguages(movie.Metadata.SpokenLanguages).
		SetMetadataStatus(movie.Metadata.Status).
		SetMetadataTagline(movie.Metadata.Tagline).
		SetMetadataTitle(movie.Metadata.Title).
		SetMetadataVideo(movie.Metadata.Video).
		SetMetadataVoteAverage(movie.Metadata.VoteAverage).
		SetMetadataVoteCount(movie.Metadata.VoteCount).
		SetCollectionID(movie.BelongsToCollection.ID).
		SetCollectionName(movie.BelongsToCollection.Name).
		SetCollectionPosterPath(movie.BelongsToCollection.PosterPath).
		SetCollectionBackdropPath(movie.BelongsToCollection.BackdropPath).
		Save(context.Background())
	if err != nil {
		return err
	}
	*movie = *movieWithFileToModel(created)
	return nil
}

func movieQuery(query *models.SearchQueryParams) *ent.MovieWithFileQuery {
	q := EntClient.MovieWithFile.Query()
	if query.Title != "" {
		q = q.Where(moviewithfile.MetadataTitleContainsFold(query.Title))
	}
	if query.Year != "" {
		q = q.Where(moviewithfile.MetadataReleaseDateHasPrefix(query.Year))
	}

	switch query.SortBy {
	case "recent":
		q = q.Order(moviewithfile.ByCreatedAt(entsql.OrderDesc()))
	case "latest":
		q = q.Order(moviewithfile.ByMetadataReleaseDate(entsql.OrderDesc()))
	case "popular":
		q = q.Order(
			moviewithfile.ByMetadataVoteAverage(entsql.OrderDesc()),
			moviewithfile.ByMetadataVoteCount(entsql.OrderDesc()),
		)
	default:
		q = q.Order(moviewithfile.ByTmdbID())
	}

	return q
}

func movieWithFileToModel(movie *ent.MovieWithFile) *models.MovieWithFiles {
	return &models.MovieWithFiles{
		BaseModel: models.BaseModel{
			ID:        uint(movie.ID),
			CreatedAt: movie.CreatedAt,
			UpdatedAt: movie.UpdatedAt,
			DeletedAt: movie.DeletedAt,
		},
		TMDbID:   movie.TmdbID,
		Location: movie.Location,
		Metadata: models.MovieMetadata{
			Adult:            movie.MetadataAdult,
			BackdropPath:     movie.MetadataBackdropPath,
			Genres:           movie.MetadataGenres,
			Homepage:         movie.MetadataHomepage,
			IMDbID:           movie.MetadataImdbID,
			OriginalLanguage: movie.MetadataOriginalLanguage,
			OriginalTitle:    movie.MetadataOriginalTitle,
			Overview:         movie.MetadataOverview,
			Popularity:       movie.MetadataPopularity,
			PosterPath:       movie.MetadataPosterPath,
			ReleaseDate:      movie.MetadataReleaseDate,
			Revenue:          movie.MetadataRevenue,
			Runtime:          movie.MetadataRuntime,
			SpokenLanguages:  movie.MetadataSpokenLanguages,
			Status:           movie.MetadataStatus,
			Tagline:          movie.MetadataTagline,
			Title:            movie.MetadataTitle,
			Video:            movie.MetadataVideo,
			VoteAverage:      movie.MetadataVoteAverage,
			VoteCount:        movie.MetadataVoteCount,
		},
		BelongsToCollection: models.BelongsToCollection{
			ID:           movie.CollectionID,
			Name:         movie.CollectionName,
			PosterPath:   movie.CollectionPosterPath,
			BackdropPath: movie.CollectionBackdropPath,
		},
	}
}
