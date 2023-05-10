package common

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

var Logger zerolog.Logger

func init() {
	// Set up logger
	output := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.DateTime}
	Logger = zerolog.New(output).With().Timestamp().Logger()
}
