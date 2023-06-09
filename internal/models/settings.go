package models

import (
	"gorm.io/gorm"
)

type AppSettings struct {
	gorm.Model
	MovieLocations  StringArray        `json:"movie_locations" gorm:"column:movie_locations;type:text[]"`
	TVShowLocations StringArray        `json:"tv_show_locations" gorm:"column:tv_show_locations;type:text[]"`
	EmailSMTP       *EmailSMTPSettings `json:"email_smtp" gorm:"embedded"`
	NewUserSignup   bool               `json:"new_user_signup" gorm:"column:new_user_signup;default:true"`
}

type EmailSMTPSettings struct {
	SMTPServer string `json:"smtp_server" gorm:"column:smtp_server"`
	Port       int    `json:"smtp_port" gorm:"column:smtp_port"`
	Username   string `json:"smtp_username" gorm:"column:smtp_username"`
	Password   string `json:"smtp_password" gorm:"column:smtp_password"`
}
