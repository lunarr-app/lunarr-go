package schema

type UserLogin struct {
	Username string `json:"username" validate:"required,min=2,max=16,alphanum"`
	Password string `json:"password" validate:"required,min=6,max=32"`
}

type UserSignup struct {
	Displayname string `json:"displayname" validate:"required,min=1,max=48"`
	Username    string `json:"username" validate:"required,min=2,max=16,alphanum"`
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=6,max=32"`
	Sex         string `json:"sex,omitempty" validate:"oneof=male female unknown"`
}

type UserLoginResponse struct {
	Status string `json:"status"`
	APIKey string `json:"api_key"`
}

type UserSignupResponse struct {
	Status  int    `json:"status"`
	Message string `json:"message"`
}
