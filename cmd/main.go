package main

import (
	"fmt"

	"github.com/kataras/iris/v12"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/lunarr-app/lunarr-go/internal/db"
	"github.com/lunarr-app/lunarr-go/internal/server"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
)

func main() {
	// Parse command-line flags
	config.ParseFlags()

	// Initialize the database
	db.InitDatabase()

	// Initialize the TMDB client
	tmdb.InitTMDBClient()

	// Create a new instance of the server
	app := server.New()

	// Start the server on the specified port
	cfg := config.Get()
	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	app.Run(iris.Addr(addr))
}
