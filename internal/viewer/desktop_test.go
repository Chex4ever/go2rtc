package viewer

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/stretchr/testify/require"
)

func resetDesktopUpdate() {
	desktopVersion = ""
	desktopInstaller = ""
	desktopSha256 = ""
	desktopNotes = ""
	app.ConfigPath = ""
}

func TestDesktopUpdateAPI(t *testing.T) {
	dir := t.TempDir()
	installer := filepath.Join(dir, "setup.exe")
	require.NoError(t, os.WriteFile(installer, []byte("fake-installer"), 0o600))

	app.ConfigPath = filepath.Join(dir, "go2rtc.yaml")
	desktopVersion = "2.0.0"
	desktopInstaller = "setup.exe"
	desktopSha256 = "abc"
	desktopNotes = "Test release"
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
	desktopVersion = "2.0.0"
	desktopInstaller = "missing.exe"
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
	desktopVersion = "2.0.0"
	desktopInstaller = "setup.exe"
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
	desktopInstaller = "setup.exe"
	t.Cleanup(resetDesktopUpdate)

	_, ok := desktopInstallerReady()
	require.False(t, ok)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "setup.exe"), []byte("ok"), 0o600))
	p, ok := desktopInstallerReady()
	require.True(t, ok)
	require.Equal(t, filepath.Join(dir, "setup.exe"), p)
}
