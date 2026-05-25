package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetStatusUnsupported(t *testing.T) {
	st, err := GetStatus()
	require.NoError(t, err)
	if Supported() {
		t.Skip("windows-only negative path")
	}
	require.False(t, st.Supported)
}
