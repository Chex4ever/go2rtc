package viewer

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestStoreSaveLoad(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "viewer.yaml")

	s := NewStore(path)
	s.Users["alice"] = &User{Password: "pass", Layouts: []string{"lobby"}}
	s.Layouts["lobby"] = &Layout{Grid: 6, Cameras: []string{"cam1", "cam2"}}
	require.NoError(t, s.Save())

	s2 := NewStore(path)
	require.NoError(t, s2.Load())
	require.True(t, s2.CheckPassword("alice", "pass"))
	require.False(t, s2.CheckPassword("alice", "wrong"))

	l, ok := s2.Layout("lobby")
	require.True(t, ok)
	require.Equal(t, 6, l.Grid)
	require.Equal(t, []string{"cam1", "cam2"}, l.Cameras)
}

func TestStoreTrustIP(t *testing.T) {
	s := NewStore(t.TempDir() + "/viewer.yaml")
	s.Users["bob"] = &User{Password: "x", Layouts: nil}

	exp := time.Now().Add(time.Hour)
	require.NoError(t, s.TrustIP("192.168.1.10", "bob", exp))

	user, ok := s.UserForTrustedIP("192.168.1.10")
	require.True(t, ok)
	require.Equal(t, "bob", user)

	s.TrustedIPs["192.168.1.10"].Expires = time.Now().Add(-time.Minute)
	s.PruneExpiredTrust()
	_, ok = s.UserForTrustedIP("192.168.1.10")
	require.False(t, ok)
}

func TestValidateTiles(t *testing.T) {
	layout := &Layout{Grid: 6, Cameras: []string{"cam1"}}
	require.NoError(t, validateTiles([]Tile{{Stream: "cam1"}}, layout))
	require.Error(t, validateTiles([]Tile{{Stream: "cam2"}}, layout))
}

func TestValidGrid(t *testing.T) {
	require.True(t, ValidGrid(25))
	require.False(t, ValidGrid(8))
}
