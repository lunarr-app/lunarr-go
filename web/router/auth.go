package router

import (
	"github.com/kataras/iris/v12"
)

func LoginPage(ctx iris.Context) {
	ctx.View("login.hbs")
}

func SignupPage(ctx iris.Context) {
	ctx.View("signup.hbs")
}
