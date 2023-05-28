package router

import (
	"github.com/kataras/iris/v12"
)

func NotFoundPage(ctx iris.Context) {
	ctx.View("404.hbs")
}

func InternalServerErrorPage(ctx iris.Context) {
	ctx.View("500.hbs")
}
