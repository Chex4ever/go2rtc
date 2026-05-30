package viewer

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/AlexxIT/go2rtc/internal/release"
	"github.com/stretchr/testify/require"
)

func resetDesktopUpdate() {
	desktopUp = desktopUpdateCfg{}
	app.ConfigPath = ""
}

func TestDesktopUpdateAPI(t *testing.T) {
	dir := t.TempDir()
	installer := filepath.Join(dir, "setup.exe")
	require.NoError(t, os.WriteFile(installer, []byte("fake-installer"), 0o600))

	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	desktopUp.Version = "2.0.0"
	desktopUp.Installer = "setup.exe"
	desktopUp.Sha256 = "abc"
	desktopUp.Notes = "Test release"
	t.Cleanup(resetDesktopUpdate)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"version":"2.0.0"`)
	require.Contains(t, rec.Body.String(), `/api/viewer/desktop/download`)

	req2 := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/download", nil)
	rec2 := httptest.NewRecorder()
	apiDesktopDownload(rec2, req2)
	require.Equal(t, http.StatusOK, rec2.Code)
	require.Equal(t, "fake-installer", rec2.Body.String())
}

func TestDesktopUpdateNotConfigured(t *testing.T) {
	t.Cleanup(resetDesktopUpdate)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestDesktopUpdateMissingInstallerFile(t *testing.T) {
	dir := t.TempDir()
	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	desktopUp.Version = "2.0.0"
	desktopUp.Installer = "missing.exe"
	t.Cleanup(resetDesktopUpdate)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestDesktopUpdateUnsupportedPlatform(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "setup.exe"), []byte("x"), 0o600))
	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	desktopUp.Version = "2.0.0"
	desktopUp.Installer = "setup.exe"
	t.Cleanup(resetDesktopUpdate)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update?platform=linux", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestResolveInstallerPath(t *testing.T) {
	dir := t.TempDir()
	t.Cleanup(resetDesktopUpdate)

	abs := filepath.Join(dir, "a.exe")
	require.Equal(t, abs, resolveInstallerPath(abs))

	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	require.Equal(t, abs, resolveInstallerPath("a.exe"))

	app.ConfigPath = ""
	require.Equal(t, "", resolveInstallerPath("relative-without-config.exe"))
}

func TestDesktopInstallerReady(t *testing.T) {
	dir := t.TempDir()
	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	desktopUp.Installer = "setup.exe"
	t.Cleanup(resetDesktopUpdate)

	_, ok := desktopInstallerReady()
	require.False(t, ok)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "setup.exe"), []byte("ok"), 0o600))
	p, ok := desktopInstallerReady()
	require.True(t, ok)
	require.Equal(t, filepath.Join(dir, "setup.exe"), p)
}

func TestDesktopUpdateFromGithub(t *testing.T) {
	t.Cleanup(resetDesktopUpdate)
	oldFetch := release.FetchLatestRelease
	release.FetchLatestRelease = func(repo string) (*release.GitHubRelease, error) {
		require.Equal(t, "Chex4ever/go2rtc", repo)
		return &release.GitHubRelease{
			TagName: "v3.0.1",
			Body:    "Hotfix body",
			HTMLURL: "https://github.com/Chex4ever/go2rtc/releases/tag/v3.0.1",
			Assets: []release.Asset{
				{Name: "go2rtc_3.0.1_windows_amd64.exe"},
				{Name: "go2rtc.Camera.Wall.Setup.3.0.1.exe", BrowserDownloadURL: "https://example.com/setup.exe"},
			},
		}, nil
	}
	t.Cleanup(func() { release.FetchLatestRelease = oldFetch })

	desktopUp.Github = "Chex4ever/go2rtc"
	desktopUp.ghClient = release.NewClient(desktopUp.Github, time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"version":"3.0.1"`)
	require.Contains(t, rec.Body.String(), `"release_tag":"3.0.1"`)
	require.Contains(t, rec.Body.String(), `"source":"github"`)
	require.Contains(t, rec.Body.String(), `https://example.com/setup.exe`)
}

func TestDesktopUpdateFromGithubTagNewerThanInstaller(t *testing.T) {
	t.Cleanup(resetDesktopUpdate)
	oldFetch := release.FetchLatestRelease
	release.FetchLatestRelease = func(repo string) (*release.GitHubRelease, error) {
		return &release.GitHubRelease{
			TagName: "v3.0.1",
			Assets: []release.Asset{
				{Name: "go2rtc.Camera.Wall.Setup.3.0.0.exe", BrowserDownloadURL: "https://example.com/setup.exe"},
			},
		}, nil
	}
	t.Cleanup(func() { release.FetchLatestRelease = oldFetch })

	desktopUp.Github = "Chex4ever/go2rtc"
	desktopUp.ghClient = release.NewClient(desktopUp.Github, time.Minute)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/desktop/update", nil)
	rec := httptest.NewRecorder()
	apiDesktopUpdate(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"version":"3.0.0"`)
	require.Contains(t, rec.Body.String(), `"release_tag":"3.0.1"`)
}
