package server

import (
	"github.com/kataras/iris/v12"
)

func NotFoundPage(ctx iris.Context) {
	ctx.View("404.hbs")
}

func InternalServerErrorPage(ctx iris.Context) {
	ctx.View("500.hbs")
}

func LoginPage(ctx iris.Context) {
	ctx.View("login.hbs")
}

func SignupPage(ctx iris.Context) {
	ctx.View("signup.hbs")
}
