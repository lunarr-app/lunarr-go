package models

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
