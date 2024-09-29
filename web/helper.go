package web

import (
	"fmt"

	"github.com/rs/zerolog/log"
)

func IncludeFile(path string) string {
	content, err := viewsFS.ReadFile(fmt.Sprintf("views/%s", path))
	if err != nil {
		log.Err(err).Msg("Failed to read file")
		return ""
	}

	return string(content)
}
