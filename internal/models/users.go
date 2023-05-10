package models

import "time"

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
	Displayname   string    `bson:"displayname" validate:"required,min=1,max=48"`
	Username      string    `bson:"username" validate:"required,min=2,max=16,alphanum,usernamepattern"`
	Password      string    `bson:"password" validate:"required,min=6,max=32"`
	Sex           string    `bson:"sex" validate:"required,oneof=male female unknown"`
	Role          string    `bson:"role" validate:"omitempty,oneof=admin superuser subscriber"`
	APIKey        string    `bson:"api_key"`
	CreatedAt     time.Time `bson:"created_at"`
	UpdatedAt     time.Time `bson:"updated_at"`
	LastSeenAt    time.Time `bson:"last_seen_at"`
	CurrentStatus string    `bson:"current_status" validate:"omitempty,oneof=active restricted disabled banned"`
}
