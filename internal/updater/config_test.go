package updater

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestLoadConfigFromYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "go2rtc.yaml")
	require.NoError(t, os.WriteFile(path, []byte(`
updater:
  enabled: true
  auto_apply: true
  interval: 12h
  github: org/repo
`), 0o600))

	cfg, err := LoadConfigFromYAML(path)
	require.NoError(t, err)
	require.True(t, cfg.Enabled)
	require.True(t, cfg.AutoApply)
	require.Equal(t, "org/repo", cfg.Github)
	require.Equal(t, 12*time.Hour, cfg.IntervalDuration())
}
