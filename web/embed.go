package web

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:assets
var AssetsFS embed.FS

//go:embed all:views
var ViewsFS embed.FS

func GetViewsFS() (http.FileSystem, error) {
	fs, err := fs.Sub(ViewsFS, "views")
	if err != nil {
		return nil, err
	}
	return http.FS(fs), nil
}

func GetAssetsFS() (http.FileSystem, error) {
	fs, err := fs.Sub(AssetsFS, "assets")
	if err != nil {
		return nil, err
	}
	return http.FS(fs), nil
}
