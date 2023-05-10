package main

import (
	"fmt"

	"github.com/kataras/iris/v12"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/server"
)

func main() {
	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	cfg := config.Get()
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	app.Run(iris.Addr(addr))
}
