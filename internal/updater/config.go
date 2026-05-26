package updater

import (
	"os"
	"path/filepath"
	"runtime"
	"time"

	"gopkg.in/yaml.v3"
)

const defaultServiceName = "go2rtc"
const updaterServiceName = "go2rtc-updater"

// ServiceStatus reports Windows go2rtc-updater service installation state (API).
type ServiceStatus struct {
	Supported bool   `json:"supported"`
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Name      string `json:"name"`
	Message   string `json:"message,omitempty"`
}

// Config drives automatic go2rtc binary updates (Windows service).
type Config struct {
	Enabled   bool   `yaml:"enabled"`
	AutoApply bool   `yaml:"auto_apply"`
	Interval  string `yaml:"interval"`
	Github    string `yaml:"github"`
	Binary    string `yaml:"binary"`
	Sha256    string `yaml:"sha256"`
	Version   string `yaml:"version"`
	Notes     string `yaml:"notes"`
	Service   string `yaml:"service"`
	Target    string `yaml:"target"`
	APIURL    string `yaml:"api_url"`
	StatusDir string `yaml:"status_dir"`
	CacheTTL  string `yaml:"cache_ttl"`
}

func DefaultConfig() Config {
	return Config{
		Enabled:   false,
		AutoApply: true,
		Interval:  "6h",
		Service:   defaultServiceName,
		APIURL:    "http://127.0.0.1:1984",
	}
}

func (c *Config) Normalize() {
	if c.Service == "" {
		c.Service = defaultServiceName
	}
	if c.Interval == "" {
		c.Interval = "6h"
	}
	if c.APIURL == "" {
		c.APIURL = "http://127.0.0.1:1984"
	}
	if c.StatusDir == "" {
		c.StatusDir = defaultStatusDir()
	}
}

func (c *Config) IntervalDuration() time.Duration {
	d, err := time.ParseDuration(c.Interval)
	if err != nil || d < time.Minute {
		return 6 * time.Hour
	}
	return d
}

func (c *Config) CacheTTLDuration() time.Duration {
	if c.CacheTTL == "" {
		return 10 * time.Minute
	}
	d, err := time.ParseDuration(c.CacheTTL)
	if err != nil {
		return 10 * time.Minute
	}
	return d
}

// LoadConfigFromYAML reads top-level `updater:` from go2rtc config file.
func LoadConfigFromYAML(path string) (Config, error) {
	cfg := DefaultConfig()
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	var root struct {
		Updater Config `yaml:"updater"`
	}
	if err := yaml.Unmarshal(data, &root); err != nil {
		return cfg, err
	}
	cfg = root.Updater
	cfg.Normalize()
	return cfg, nil
}

func defaultStatusDir() string {
	if runtime.GOOS == "windows" {
		if d := os.Getenv("ProgramData"); d != "" {
			return filepath.Join(d, "go2rtc")
		}
	}
	return filepath.Join(os.TempDir(), "go2rtc-updater")
}
