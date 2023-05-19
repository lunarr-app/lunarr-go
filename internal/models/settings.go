package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type AppSettings struct {
	ID              primitive.ObjectID `json:"_id" bson:"_id,omitempty"`
	MovieLocations  []string           `json:"movie_locations" bson:"movie_locations"`
	TVShowLocations []string           `json:"tv_show_locations" bson:"tv_show_locations"`
	EmailSMTP       *EmailSMTPSettings `json:"email_smtp" bson:"email_smtp,omitempty"`
	CreatedAt       time.Time          `json:"created_at" bson:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at" bson:"updated_at"`
}

type EmailSMTPSettings struct {
	SMTPServer string `json:"smtp_server" bson:"smtp_server"`
	Port       int    `json:"port" bson:"port"`
	Username   string `json:"username" bson:"username"`
	Password   string `json:"password" bson:"password"`
}
