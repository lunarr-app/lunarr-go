package models

import (
	"gorm.io/gorm"
)

type AppSettings struct {
	gorm.Model
	MovieLocations  StringArray        `json:"movie_locations" gorm:"column:movie_locations;type:text[]"`
	TVShowLocations StringArray        `json:"tv_show_locations" gorm:"column:tv_show_locations;type:text[]"`
	EmailSMTP       *EmailSMTPSettings `json:"email_smtp" gorm:"embedded"`
}

type EmailSMTPSettings struct {
	SMTPServer string `json:"smtp_server" gorm:"column:smtp_server"`
	Port       int    `json:"port" gorm:"column:port"`
	Username   string `json:"username" gorm:"column:username"`
	Password   string `json:"password" gorm:"column:password"`
}
