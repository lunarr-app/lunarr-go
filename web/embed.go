package web

import (
	"embed"
	"net/http"
)

//go:embed all:assets
var AssetsFS embed.FS

//go:embed all:views
var ViewsFS embed.FS

func GetViewsFS() http.FileSystem {
	return http.FS(ViewsFS)
}
