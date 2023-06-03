package web

import (
	"fmt"

	"github.com/lunarr-app/lunarr-go/internal/util"
)

func IncludeFile(path string) string {
	content, err := viewsFS.ReadFile(fmt.Sprintf("views/%s", path))
	if err != nil {
		util.Logger.Err(err).Msg("Failed to read file")
		return ""
	}

	return string(content)
}
