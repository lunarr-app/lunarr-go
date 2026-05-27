package db

import (
	"context"
	"fmt"
	"time"

	"github.com/lunarr-app/lunarr-go/internal/ent"
	"github.com/lunarr-app/lunarr-go/internal/ent/useraccount"
	"github.com/lunarr-app/lunarr-go/internal/models"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

// CountUsers counts the number of users in the database.
func CountUsers() (int64, error) {
	count, err := EntClient.UserAccount.Query().Count(context.Background())
	return int64(count), err
}

// InsertUser inserts a new user into the users table
func InsertUser(user *models.UserAccounts) error {
	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	user.Password = string(hashedPassword)

	created, err := EntClient.UserAccount.Create().
		SetDisplayname(user.Displayname).
		SetUsername(user.Username).
		SetEmail(user.Email).
		SetPassword(user.Password).
		SetSex(user.Sex).
		SetRole(string(user.Role)).
		SetAPIKey(user.APIKey).
		SetCurrentStatus(user.CurrentStatus).
		SetSettingTheme(user.Settings.Theme).
		SetSettingEnabled(user.Settings.Subtitle.Enabled).
		SetSettingLanguage(user.Settings.Subtitle.Language).
		SetSettingResolution(user.Settings.Transcoding.Resolution).
		SetSettingBitrate(user.Settings.Transcoding.Bitrate).
		SetSettingCodec(user.Settings.Transcoding.Codec).
		SetLastSeenAt(user.LastSeenAt).
		Save(context.Background())
	if err != nil {
		log.Error().Err(err).Msg("Failed to insert user into database")
		return err
	}

	*user = *userAccountToModel(created, true)

	return nil
}

// UpdateUser updates an existing user in the users table
func UpdateUser(username string, updates map[string]interface{}) error {
	update := EntClient.UserAccount.Update().Where(useraccount.UsernameEQ(username))
	for key, value := range updates {
		switch key {
		case "displayname":
			update.SetDisplayname(asString(value))
		case "username":
			update.SetUsername(asString(value))
		case "email":
			update.SetEmail(asString(value))
		case "password":
			update.SetPassword(asString(value))
		case "sex":
			update.SetSex(asString(value))
		case "role":
			update.SetRole(asString(value))
		case "api_key":
			update.SetAPIKey(asString(value))
		case "current_status":
			update.SetCurrentStatus(asString(value))
		case "setting_theme":
			update.SetSettingTheme(asString(value))
		case "setting_enabled":
			update.SetSettingEnabled(asBool(value))
		case "setting_language":
			update.SetSettingLanguage(asString(value))
		case "setting_resolution":
			update.SetSettingResolution(asString(value))
		case "setting_bitrate":
			update.SetSettingBitrate(asInt(value))
		case "setting_codec":
			update.SetSettingCodec(asString(value))
		case "last_seen_at":
			t, ok := value.(time.Time)
			if !ok {
				return fmt.Errorf("last_seen_at must be time.Time")
			}
			update.SetLastSeenAt(t)
		default:
			return fmt.Errorf("unsupported user update field %q", key)
		}
	}

	_, err := update.Save(context.Background())
	if err != nil {
		log.Error().Err(err).Msg("Failed to update user in database")
		return err
	}

	return nil
}

// FindUserByUsername finds a user in the users table by username
func FindUserByUsername(username string) (*models.UserAccounts, error) {
	user, err := EntClient.UserAccount.Query().
		Where(useraccount.UsernameEQ(username)).
		Only(context.Background())
	if err != nil {
		return nil, err
	}

	return userAccountToModel(user, false), nil
}

// FindUserByEmailOrUsername finds a user in the users table by email or username
func FindUserByEmailOrUsername(email string, username string) (*models.UserAccounts, error) {
	user, err := EntClient.UserAccount.Query().
		Where(useraccount.Or(
			useraccount.EmailEQ(email),
			useraccount.UsernameEQ(username),
		)).
		Only(context.Background())
	if err != nil {
		return nil, err
	}

	return userAccountToModel(user, false), nil
}

// GetUserByAPIKey returns a user from the users table by API key
func GetUserByAPIKey(apiKey string) (*models.UserAccounts, error) {
	user, err := EntClient.UserAccount.Query().
		Where(useraccount.APIKeyEQ(apiKey)).
		Only(context.Background())
	if err != nil {
		return nil, err
	}

	return userAccountToModel(user, false), nil
}

// FindAllUsers retrieves all users from the users table
func FindAllUsers() ([]models.UserAccounts, error) {
	users, err := EntClient.UserAccount.Query().All(context.Background())
	if err != nil {
		return nil, err
	}

	result := make([]models.UserAccounts, 0, len(users))
	for _, user := range users {
		result = append(result, *userAccountToModel(user, false))
	}

	return result, nil
}

// VerifyUserPassword verifies the password for a given username
func VerifyUserPassword(username, password string) bool {
	user, err := EntClient.UserAccount.Query().
		Where(useraccount.UsernameEQ(username)).
		Only(context.Background())
	if err != nil {
		return false
	}

	return bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) == nil
}

func DeleteUserByUsername(username string) error {
	_, err := EntClient.UserAccount.Delete().
		Where(useraccount.UsernameEQ(username)).
		Exec(context.Background())
	return err
}

func userAccountToModel(user *ent.UserAccount, includePassword bool) *models.UserAccounts {
	password := ""
	if includePassword {
		password = user.Password
	}

	return &models.UserAccounts{
		BaseModel: models.BaseModel{
			ID:        uint(user.ID),
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
			DeletedAt: user.DeletedAt,
		},
		Displayname:   user.Displayname,
		Username:      user.Username,
		Email:         user.Email,
		Password:      password,
		Sex:           user.Sex,
		Role:          models.UserRole(user.Role),
		APIKey:        user.APIKey,
		CurrentStatus: user.CurrentStatus,
		Settings: models.UserSettings{
			Theme: user.SettingTheme,
			Subtitle: models.SubtitleSettings{
				Enabled:  user.SettingEnabled,
				Language: user.SettingLanguage,
			},
			Transcoding: models.TranscodingSettings{
				Resolution: user.SettingResolution,
				Bitrate:    user.SettingBitrate,
				Codec:      user.SettingCodec,
			},
		},
		LastSeenAt: user.LastSeenAt,
	}
}

func asString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	case models.UserRole:
		return string(typed)
	default:
		return fmt.Sprint(value)
	}
}

func asBool(value interface{}) bool {
	typed, _ := value.(bool)
	return typed
}

func asInt(value interface{}) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	default:
		return 0
	}
}
