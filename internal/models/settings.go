package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AppSettings struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"`
	MovieLocations  []string           `bson:"movie_locations"`
	TVShowLocations []string           `bson:"tv_show_locations"`
	EmailSMTP       *EmailSMTPSettings `bson:"email_smtp,omitempty"`
	CreatedAt       time.Time          `bson:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at"`
}

type EmailSMTPSettings struct {
	SMTPServer string `bson:"smtp_server"`
	Port       int    `bson:"port"`
	Username   string `bson:"username"`
	Password   string `bson:"password"`
}
