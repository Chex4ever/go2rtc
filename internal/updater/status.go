package updater

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// Status is written for go2rtc API / operators (JSON file).
type Status struct {
	UpdatedAt       string `json:"updated_at"`
	State           string `json:"state"`
	RunningVersion  string `json:"running_version,omitempty"`
	AvailableVersion string `json:"available_version,omitempty"`
	Message         string `json:"message,omitempty"`
	LastCheck       string `json:"last_check,omitempty"`
	LastApply       string `json:"last_apply,omitempty"`
	ReleaseURL      string `json:"release_url,omitempty"`
}

func (c *Config) statusPath() string {
	return filepath.Join(c.StatusDir, "updater-status.json")
}

func (c *Config) WriteStatus(st Status) error {
	if err := os.MkdirAll(c.StatusDir, 0o755); err != nil {
		return err
	}
	if st.UpdatedAt == "" {
		st.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.statusPath(), data, 0o644)
}

func ReadStatusFile(path string) (Status, error) {
	var st Status
	data, err := os.ReadFile(path)
	if err != nil {
		return st, err
	}
	err = json.Unmarshal(data, &st)
	return st, err
}
