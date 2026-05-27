package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type UserAccount struct {
	ent.Schema
}

func (UserAccount) Fields() []ent.Field {
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
		field.String("displayname").
			MaxLen(48),
		field.String("username").
			MaxLen(16),
		field.String("email").
			MaxLen(128),
		field.String("password"),
		field.String("sex").
			MaxLen(10),
		field.String("role").
			MaxLen(15),
		field.String("api_key").
			MaxLen(32),
		field.String("current_status").
			MaxLen(15).
			Default(""),
		field.String("setting_theme").
			MaxLen(10).
			Default("system"),
		field.Bool("setting_enabled").
			Default(true),
		field.String("setting_language").
			MaxLen(10).
			Default("en-US"),
		field.String("setting_resolution").
			MaxLen(10).
			Default("direct"),
		field.Int("setting_bitrate").
			Default(2000),
		field.String("setting_codec").
			MaxLen(10).
			Default("h264"),
		field.Time("last_seen_at").
			Optional(),
	}
}

func (UserAccount) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("username").Unique(),
		index.Fields("email").Unique(),
		index.Fields("api_key").Unique(),
	}
}
