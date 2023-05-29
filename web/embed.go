package web

import (
	"embed"
)

//go:embed all:assets
var AssetsFS embed.FS

//go:embed all:views
var ViewsFS embed.FS
