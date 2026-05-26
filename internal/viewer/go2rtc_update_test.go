package viewer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/AlexxIT/go2rtc/internal/release"
	"github.com/stretchr/testify/require"
)

func TestPickGithubAsset(t *testing.T) {
	assets := []release.Asset{{Name: "go2rtc_1.2.2_windows_amd64.exe"}}
	a, err := release.PickAsset(assets, "windows", "amd64")
	require.NoError(t, err)
	require.Contains(t, a.Name, "windows_amd64")
}

func TestApiGo2rtcUpdateGithub(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(release.GitHubRelease{
			TagName: "v2.1.0",
			Body:    "From GitHub",
			HTMLURL: "https://github.com/test/repo/releases/tag/v2.1.0",
			Assets: []release.Asset{{
				Name:               "go2rtc_2.1.0_windows_amd64.exe",
				BrowserDownloadURL: "https://cdn.example/go2rtc.exe",
			}},
		})
	}))
	defer srv.Close()

	orig := release.FetchLatestRelease
	release.FetchLatestRelease = func(repo string) (*release.GitHubRelease, error) {
		res, err := http.Get(srv.URL)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		var rel release.GitHubRelease
		require.NoError(t, json.NewDecoder(res.Body).Decode(&rel))
		return &rel, nil
	}
	defer func() { release.FetchLatestRelease = orig }()

	app.Version = "2.0.0"
	go2rtcUp = go2rtcUpdateCfg{
		Github:   "test/repo",
		ghClient: release.NewClient("test/repo", 0),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/go2rtc/update?platform=windows", nil)
	rec := httptest.NewRecorder()
	apiGo2rtcUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var info go2rtcUpdateInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &info))
	require.Equal(t, "2.1.0", info.Version)
	require.Equal(t, "github", info.Source)
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
	require.Equal(t, "local", info.Source)
}
