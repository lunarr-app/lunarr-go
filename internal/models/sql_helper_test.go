package models_test

import (
	"database/sql/driver"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/lunarr-app/lunarr-go/internal/models"
)

func TestStringArray_Scan(t *testing.T) {
	t.Run("Valid []byte input", func(t *testing.T) {
		input := []byte(`["location1", "location2", "location3"]`)
		expected := models.StringArray{"location1", "location2", "location3"}

		var sa models.StringArray
		err := sa.Scan(input)
		assert.NoError(t, err)
		assert.Equal(t, expected, sa)
	})

	t.Run("Valid string input", func(t *testing.T) {
		input := `["location1", "location2", "location3"]`
		expected := models.StringArray{"location1", "location2", "location3"}

		var sa models.StringArray
		err := sa.Scan(input)
		assert.NoError(t, err)
		assert.Equal(t, expected, sa)
	})

	t.Run("Invalid input type", func(t *testing.T) {
		input := 123 // Invalid type

		var sa models.StringArray
		err := sa.Scan(input)
		assert.Error(t, err)
		assert.Equal(t, models.StringArray(nil), sa)
	})

	t.Run("Nil input", func(t *testing.T) {
		var sa models.StringArray
		err := sa.Scan(nil)
		assert.NoError(t, err)
		assert.Equal(t, models.StringArray(nil), sa)
	})
}

func TestStringArray_Value(t *testing.T) {
	t.Run("Non-nil value", func(t *testing.T) {
		sa := models.StringArray{"location1", "location2", "location3"}
		expected, _ := json.Marshal(sa)

		value, err := sa.Value()
		assert.NoError(t, err)
		assert.Equal(t, driver.Value(string(expected)), value)
	})

	t.Run("Nil value", func(t *testing.T) {
		var sa models.StringArray
		value, err := sa.Value()
		assert.NoError(t, err)
		assert.Nil(t, value)
	})
}
