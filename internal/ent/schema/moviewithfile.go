package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"

	"github.com/lunarr-app/lunarr-go/internal/models"
)

type MovieWithFile struct {
	ent.Schema
}

func (MovieWithFile) Fields() []ent.Field {
	return []ent.Field{
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
		field.Time("deleted_at").
			Optional().
			Nillable(),
		field.Int32("tmdb_id").
			Default(0),
		field.String("location").
			Default(""),
		field.Bool("metadata_adult").
			Default(false),
		field.String("metadata_backdrop_path").
			Default(""),
		field.JSON("metadata_genres", []models.TMDbGenre{}).
			Default([]models.TMDbGenre{}),
		field.String("metadata_homepage").
			Default(""),
		field.String("metadata_imdb_id").
			Default(""),
		field.String("metadata_original_language").
			Default(""),
		field.String("metadata_original_title").
			Default(""),
		field.String("metadata_overview").
			Default(""),
		field.Float32("metadata_popularity").
			Default(0),
		field.String("metadata_poster_path").
			Default(""),
		field.String("metadata_release_date").
			Default(""),
		field.Int64("metadata_revenue").
			Default(0),
		field.Int("metadata_runtime").
			Default(0),
		field.JSON("metadata_spoken_languages", []models.TMDbSpokenLanguage{}).
			Default([]models.TMDbSpokenLanguage{}),
		field.String("metadata_status").
			Default(""),
		field.String("metadata_tagline").
			Default(""),
		field.String("metadata_title").
			Default(""),
		field.Bool("metadata_video").
			Default(false),
		field.Float32("metadata_vote_average").
			Default(0),
		field.Int64("metadata_vote_count").
			Default(0),
		field.Int64("collection_id").
			Default(0),
		field.String("collection_name").
			Default(""),
		field.String("collection_poster_path").
			Default(""),
		field.String("collection_backdrop_path").
			Default(""),
	}
}
