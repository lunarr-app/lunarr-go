package db

import (
	"testing"

	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestReadWriteSQLite(t *testing.T) {
	// Initialize the SQLite database
	initSQLite("")
	err := DB.AutoMigrate(
		&models.MovieWithFiles{},
	)
	assert.NoError(t, err)

	// Perform sample read and write operations
	err = writeToSQLite()
	assert.NoError(t, err)

	result, err := readFromSQLite()
	assert.NoError(t, err)
	assert.NotNil(t, result)

}

func writeToSQLite() error {
	// Perform write operation
	data := &models.MovieWithFiles{}
	result := DB.Create(data)
	if result.Error != nil {
		return result.Error
	}
	return nil
}

func readFromSQLite() (*models.MovieWithFiles, error) {
	// Perform read operation
	var data models.MovieWithFiles
	result := DB.First(&data)
	if result.Error != nil {
		return nil, result.Error
	}
	return &data, nil
}
