package models

import (
	"time"

	"gorm.io/gorm"
)

type UserRole string

const (
	UserRoleAdmin      UserRole = "admin"
	UserRoleSuperuser  UserRole = "superuser"
	UserRoleSubscriber UserRole = "subscriber"
)

type UserAccounts struct {
	gorm.Model
	Displayname   string       `gorm:"column:displayname;not null;size:48" json:"displayname"`
	Username      string       `gorm:"column:username;uniqueIndex:idx_username_ua;not null;size:16" json:"username"`
	Email         string       `gorm:"column:email;uniqueIndex:idx_email_ua;not null;size:128" json:"email"`
	Password      string       `gorm:"column:password;not null;size:32" json:"password"`
	Sex           string       `gorm:"column:sex;not null;size:10" json:"sex"`
	Role          UserRole     `gorm:"column:role;not null;size:15" json:"role"`
	APIKey        string       `gorm:"column:api_key;uniqueIndex:idx_api_key;not null;size:32" json:"api_key"`
	CurrentStatus string       `gorm:"column:current_status;size:15;default:''" json:"current_status"`
	Settings      UserSettings `gorm:"embedded;embeddedPrefix:setting_" json:"settings"`
	LastSeenAt    time.Time    `gorm:"column:last_seen_at" json:"last_seen_at"`
}

type UserSettings struct {
	Theme       string              `gorm:"column:theme;not null;size:10;default:'system'" json:"theme"`
	Subtitle    SubtitleSettings    `gorm:"embedded" json:"subtitle"`
	Transcoding TranscodingSettings `gorm:"embedded" json:"transcoding"`
}

type SubtitleSettings struct {
	Enabled  bool   `gorm:"column:enabled;default:true" json:"enabled"`
	Language string `gorm:"column:language;not null;size:10;default:'en-US'" json:"language"`
}

type TranscodingSettings struct {
	Resolution string `gorm:"column:resolution;not null;size:10;default:'direct'" json:"resolution"`
	Bitrate    int    `gorm:"column:bitrate;not null;default:2000" json:"bitrate"`
	Codec      string `gorm:"column:codec;not null;size:10;default:'h264'" json:"codec"`
}
