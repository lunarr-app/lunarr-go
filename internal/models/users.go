package models

import (
	"time"
)

type UserRole string

const (
	UserRoleAdmin      UserRole = "admin"
	UserRoleSuperuser  UserRole = "superuser"
	UserRoleSubscriber UserRole = "subscriber"
)

type UserAccounts struct {
	BaseModel
	Displayname   string       `json:"displayname"`
	Username      string       `json:"username"`
	Email         string       `json:"email"`
	Password      string       `json:"password"`
	Sex           string       `json:"sex"`
	Role          UserRole     `json:"role"`
	APIKey        string       `json:"api_key"`
	CurrentStatus string       `json:"current_status"`
	Settings      UserSettings `json:"settings"`
	LastSeenAt    time.Time    `json:"last_seen_at"`
}

type UserSettings struct {
	Theme       string              `json:"theme"`
	Subtitle    SubtitleSettings    `json:"subtitle"`
	Transcoding TranscodingSettings `json:"transcoding"`
}

type SubtitleSettings struct {
	Enabled  bool   `json:"enabled"`
	Language string `json:"language"`
}

type TranscodingSettings struct {
	Resolution string `json:"resolution"`
	Bitrate    int    `json:"bitrate"`
	Codec      string `json:"codec"`
}
