package tmdb

import (
	"testing"

	"github.com/lunarr-app/lunarr-go/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestInitTMDBClient(t *testing.T) {
	// Initialize config
	config.InitConfig()

	// Initialize the TMDB client
	InitTMDBClient()

	// Assert that the TmdbClient is initialized
	assert.NotNil(t, TmdbClient)

	// Example test using TmdbClient
	account, err := TmdbClient.GetAccountDetails()
	assert.NoError(t, err)
	assert.NotNil(t, account)
}
