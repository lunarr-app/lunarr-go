package handlers

import (
	"github.com/kataras/iris/v12"
)

func RootHandler(ctx iris.Context) {
	ctx.JSON(iris.Map{
		"hello": "world",
	})
}
