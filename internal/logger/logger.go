package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

var Log zerolog.Logger

func init() {
	// Set up logger
	output := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.DateTime}
	Log = zerolog.New(output).With().Timestamp().Logger()
}
