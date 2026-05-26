package release

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPickAsset(t *testing.T) {
	assets := []Asset{{Name: "go2rtc_1.2.2_windows_amd64.exe"}, {Name: "go2rtc_linux_amd64"}}
	a, err := PickAsset(assets, "windows", "amd64")
	require.NoError(t, err)
	require.Contains(t, a.Name, "windows_amd64")
}

func TestCompareSemver(t *testing.T) {
	require.Equal(t, 1, CompareSemver("1.2.2", "1.2.1"))
	require.Equal(t, 0, CompareSemver("1.2.0", "1.2.0"))
	require.True(t, IsNewer("2.0.0", "1.9.14"))
}
