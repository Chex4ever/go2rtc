package viewer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/stretchr/testify/require"
)

func TestPickGithubAsset(t *testing.T) {
	assets := []ghAsset{
		{Name: "go2rtc_1.2.1_windows_amd64.exe"},
		{Name: "go2rtc_1.2.1_linux_amd64"},
	}
	a, err := pickGithubAsset(assets, "windows", "amd64")
	require.NoError(t, err)
	require.Contains(t, a.Name, "windows_amd64")

	_, err = pickGithubAsset(assets, "linux", "arm64")
	require.Error(t, err)
}

func TestNormalizeGithubRepo(t *testing.T) {
	require.Equal(t, "org/repo", normalizeGithubRepo("https://github.com/org/repo/"))
	require.Equal(t, "org/repo", normalizeGithubRepo("org/repo"))
}

func TestApiGo2rtcUpdateLocal(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "go2rtc.exe")
	require.NoError(t, os.WriteFile(bin, []byte("fake"), 0o600))

	app.Version = "1.0.0"
	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")

	go2rtcUp = go2rtcUpdateCfg{
		Version: "9.9.9",
		Binary:  bin,
		Notes:   "local test",
	}

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/go2rtc/update?platform=windows&arch=amd64", nil)
	rec := httptest.NewRecorder()
	apiGo2rtcUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var info go2rtcUpdateInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &info))
	require.Equal(t, "9.9.9", info.Version)
	require.Equal(t, "1.0.0", info.RunningVersion)
	require.Equal(t, "local", info.Source)
}

func TestApiGo2rtcUpdateGithub(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(ghRelease{
			TagName: "v2.1.0",
			Body:    "From GitHub",
			HTMLURL: "https://github.com/test/repo/releases/tag/v2.1.0",
			Assets: []ghAsset{{
				Name:               "go2rtc_2.1.0_windows_amd64.exe",
				BrowserDownloadURL: "https://cdn.example/go2rtc.exe",
			}},
		})
	}))
	defer srv.Close()

	// Override fetch by pointing client at test server — inject via custom transport in test only.
	orig := fetchGithubLatestRelease
	fetchGithubLatestRelease = func(repo string) (*ghRelease, error) {
		require.Equal(t, "test/repo", repo)
		res, err := http.Get(srv.URL)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		var rel ghRelease
		require.NoError(t, json.NewDecoder(res.Body).Decode(&rel))
		return &rel, nil
	}
	defer func() { fetchGithubLatestRelease = orig }()

	app.Version = "2.0.0"
	go2rtcUp = go2rtcUpdateCfg{
		Github:   "test/repo",
		ghClient: newGhReleaseClient("test/repo", 0),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/go2rtc/update?platform=windows", nil)
	rec := httptest.NewRecorder()
	apiGo2rtcUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var info go2rtcUpdateInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &info))
	require.Equal(t, "2.1.0", info.Version)
	require.Equal(t, "github", info.Source)
	require.Equal(t, "https://cdn.example/go2rtc.exe", info.DownloadURL)
}
