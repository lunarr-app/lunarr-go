package config

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	"github.com/rs/zerolog/log"
)

var (
	k   *koanf.Koanf
	cfg *Config
)

type Config struct {
	Server struct {
		Host string `koanf:"host"`
		Port int    `koanf:"port"`
	} `koanf:"server"`
	TMDb struct {
		APIKey string `koanf:"api_key"`
	} `koanf:"tmdb"`
	AppDataDir string `koanf:"app_data_dir"`
}

func InitConfig() {
	k = koanf.New(".")

	defaultAppDataDir := getDefaultAppDataDir()

	k.Load(confmap.Provider(map[string]interface{}{
		"server.host":  "127.0.0.1",
		"server.port":  8484,
		"tmdb.api_key": "",
		"app_data_dir": defaultAppDataDir,
	}, "."), nil)

	yamlPath := os.Getenv("LUNARR_YAML_PATH")
	if yamlPath == "" {
		yamlPath = "lunarr.yml"
	}

	if err := k.Load(file.Provider(yamlPath), yaml.Parser()); err != nil {
		log.Warn().Msgf("No configuration file found or error reading '%s': %v", yamlPath, err)
	}

	k.Load(env.Provider("LUNARR_", ".", func(s string) string {
		s = strings.ToLower(s)
		switch s {
		case "lunarr_server_host":
			return "server.host"
		case "lunarr_server_port":
			return "server.port"
		case "lunarr_tmdb_api_key":
			return "tmdb.api_key"
		case "lunarr_app_data_dir":
			return "app_data_dir"
		default:
			return s
		}
	}), nil)

	cfg = &Config{}
	if err := k.Unmarshal("", cfg); err != nil {
		log.Fatal().Msgf("Error unmarshalling configuration: %v", err)
	}

	if cfg.AppDataDir == "" {
		cfg.AppDataDir = defaultAppDataDir
	}

	log.Info().Msgf("Server bind IP address: %s", cfg.Server.Host)
	log.Info().Msgf("Server port: %d", cfg.Server.Port)
	log.Info().Msgf("TMDb API Key: %s", cfg.TMDb.APIKey)
	log.Info().Msgf("App data directory: %s", cfg.AppDataDir)
}

func getDefaultAppDataDir() string {
	dataDir, err := os.UserConfigDir()
	if err != nil {
		log.Error().Msgf("Failed to get user configuration directory: %v", err)
		return ""
	}

	appDir := filepath.Join(dataDir, "Lunarr")
	if err := os.MkdirAll(appDir, 0700); err != nil {
		log.Fatal().Msgf("Failed to create app directory: %v", err)
	}

	return appDir
}

func Get() *Config {
	return cfg
}
