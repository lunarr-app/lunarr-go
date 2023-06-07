package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

type StringArray []string

func (s *StringArray) Scan(value interface{}) error {
	if value == nil {
		*s = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, s)
	case string:
		return json.Unmarshal([]byte(v), s)
	default:
		return errors.New("unsupported Scan value type")
	}
}

func (s StringArray) Value() (driver.Value, error) {
	if s == nil {
		return nil, nil
	}

	bytes, err := json.Marshal(s)
	return string(bytes), err
}
