package server

import (
	"fmt"
	"os"

	"github.com/lunarr-app/lunarr-go/internal/util"
)

func IncludeFile(path string) string {
	content, err := os.ReadFile(fmt.Sprintf("./web/views/%s", path))
	if err != nil {
		util.Logger.Err(err).Msg("Failed to read file")
		return ""
	}

	return string(content)
}
