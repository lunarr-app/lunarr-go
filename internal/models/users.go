package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UserRole string

const (
	UserRoleAdmin      UserRole = "admin"
	UserRoleSuperuser  UserRole = "superuser"
	UserRoleSubscriber UserRole = "subscriber"
)

type UserLogin struct {
	Username string `json:"username" validate:"required,min=2,max=16,alphanum"`
	Password string `json:"password" validate:"required,min=6,max=32"`
}

type UserSignup struct {
	Displayname string `json:"displayname" validate:"required,min=1,max=48" bson:"displayname"`
	Username    string `json:"username" validate:"required,min=2,max=16,alphanum" bson:"username"`
	Password    string `json:"password" validate:"required,min=6,max=32" bson:"password"`
	Sex         string `json:"sex,omitempty" validate:"oneof=male female unknown" bson:"sex,omitempty,default=unknown"`
}

type UserMongo struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Displayname   string             `bson:"displayname" json:"displayname" validate:"required,min=1,max=48"`
	Username      string             `bson:"username" json:"username" validate:"required,min=2,max=16,alphanum,usernamepattern"`
	Password      string             `bson:"password" json:"password" validate:"required,min=6,max=32"`
	Sex           string             `bson:"sex" json:"sex" validate:"required,oneof=male female unknown"`
	Role          UserRole           `bson:"role" json:"role" validate:"required,oneof=admin superuser subscriber"`
	APIKey        string             `bson:"api_key" json:"api_key" validate:"required,min=32,max=32"`
	CurrentStatus string             `bson:"current_status" json:"current_status" validate:"omitempty,oneof=active restricted disabled banned"`
	Settings      UserSettings       `bson:"settings" json:"settings" validate:"dive"`
	LastSeenAt    time.Time          `bson:"last_seen_at" json:"last_seen_at"`
	CreatedAt     time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`
}

type UserSettings struct {
	Theme       string              `bson:"theme" json:"theme" validate:"required,oneof=system dark light" default:"system"`
	Subtitle    SubtitleSettings    `bson:"subtitle" json:"subtitle" validate:"dive"`
	Transcoding TranscodingSettings `bson:"transcoding" json:"transcoding" validate:"dive"`
}

type SubtitleSettings struct {
	Enabled  bool   `bson:"enabled" json:"enabled" default:"true"`
	Language string `bson:"language" json:"language" validate:"required,bcp47_language_tag" default:"en-US"`
}

type TranscodingSettings struct {
	Resolution string `bson:"resolution" json:"resolution" validate:"required,oneof=direct 480p 720p 1080p 4K" default:"direct"`
	Bitrate    int    `bson:"bitrate" json:"bitrate" validate:"required" default:"2000"`
	Codec      string `bson:"codec" json:"codec" validate:"required,oneof=h264 h265" default:"h264"`
}
