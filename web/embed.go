package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:assets
var assetsFS embed.FS

//go:embed all:views
var viewsFS embed.FS

func GetViewsFS() (http.FileSystem, error) {
	fs, err := fs.Sub(viewsFS, "views")
	if err != nil {
		return nil, err
	}
	return http.FS(fs), nil
}

func GetAssetsFS() (http.FileSystem, error) {
	fs, err := fs.Sub(assetsFS, "assets")
	if err != nil {
		return nil, err
	}
	return http.FS(fs), nil
}
