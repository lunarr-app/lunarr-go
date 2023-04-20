package main

import (
	"fmt"
	"net/http"

	common "lunarr/internal"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogMethod: true,
		LogURI:    true,
		LogStatus: true,
		LogValuesFunc: func(c echo.Context, v middleware.RequestLoggerValues) error {
			common.Logger.Info().
				Str("method", v.Method).
				Str("path", v.URI).
				Int("status", v.Status).
				Msg("request")

			return nil
		},
	}))

	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Hello, World!\n")
	})

	e.Logger.Fatal(e.Start(fmt.Sprintf("%s:%d", common.Config.Bind, common.Config.Port)))
}
