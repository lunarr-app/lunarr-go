package schema

import (
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

func (u *UserLogin) Validate() error {
	return validate.Struct(u)
}

func (u *UserSignup) Validate() error {
	return validate.Struct(u)
}
