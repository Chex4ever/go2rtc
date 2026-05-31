package updater

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRunOnceRespectsEnabled(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Enabled = false
	cfg.StatusDir = t.TempDir()
	r := NewRunner(cfg)

	err := r.RunOnce(context.Background())
	require.NoError(t, err)

	st, err := ReadStatusFile(cfg.statusPath())
	require.NoError(t, err)
	require.Equal(t, "disabled", st.State)
}
