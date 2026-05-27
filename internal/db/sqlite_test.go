package db

import (
	"context"
	"testing"

	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestReadWriteSQLite(t *testing.T) {
	// Initialize the SQLite database
	initSQLite("")
	MigrateTables()

	// Perform sample read and write operations
	err := writeToSQLite()
	assert.NoError(t, err)

	result, err := readFromSQLite()
	assert.NoError(t, err)
	assert.NotNil(t, result)

}

func writeToSQLite() error {
	_, err := EntClient.MovieWithFile.Create().Save(context.Background())
	return err
}

func readFromSQLite() (*models.MovieWithFiles, error) {
	data, err := EntClient.MovieWithFile.Query().First(context.Background())
	if err != nil {
		return nil, err
	}
	return movieWithFileToModel(data), nil
}
