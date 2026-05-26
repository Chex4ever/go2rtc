package viewer

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
)

type desktopUpdateInfo struct {
	Version     string `json:"version"`
	Platform    string `json:"platform"`
	DownloadURL string `json:"download_url"`
	Notes       string `json:"notes,omitempty"`
	Sha256      string `json:"sha256,omitempty"`
}

var (
	desktopVersion   string
	desktopInstaller string
	desktopSha256    string
	desktopNotes     string
)

func initDesktopUpdate(cfg struct {
	Version   string `yaml:"version"`
	Installer string `yaml:"installer"`
	Sha256    string `yaml:"sha256"`
	Notes     string `yaml:"notes"`
}) {
	desktopVersion = strings.TrimSpace(cfg.Version)
	desktopInstaller = strings.TrimSpace(cfg.Installer)
	desktopSha256 = strings.TrimSpace(cfg.Sha256)
	desktopNotes = strings.TrimSpace(cfg.Notes)

	if desktopVersion == "" {
		return
	}

	api.HandleFunc("api/viewer/desktop/update", apiDesktopUpdate)
	api.HandleFunc("api/viewer/desktop/download", apiDesktopDownload)

	if p, ok := desktopInstallerReady(); !ok && desktopInstaller != "" {
		if p != "" {
			log.Warn().Str("path", p).Msg("[viewer] desktop installer not found")
		} else {
			log.Warn().Str("path", desktopInstaller).Msg("[viewer] desktop installer path invalid (set go2rtc config path)")
		}
	}

	log.Info().Str("version", desktopVersion).Msg("[viewer] desktop update API enabled")
}

func resolveInstallerPath(installer string) string {
	if installer == "" {
		return ""
	}
	if filepath.IsAbs(installer) {
		return filepath.Clean(installer)
	}
	if app.ConfigPath != "" {
		return filepath.Clean(filepath.Join(filepath.Dir(app.ConfigPath), installer))
	}
	return ""
}

func desktopInstallerReady() (string, bool) {
	p := resolveInstallerPath(desktopInstaller)
	if p == "" {
		return "", false
	}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return p, false
	}
	return p, true
}

func apiDesktopUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	if desktopVersion == "" {
		http.Error(w, "desktop updates not configured", http.StatusNotFound)
		return
	}

	platform := strings.ToLower(r.URL.Query().Get("platform"))
	if platform == "" || platform == "win32" {
		platform = "windows"
	}
	if platform != "windows" {
		http.Error(w, "unsupported platform", http.StatusNotFound)
		return
	}

	if _, ok := desktopInstallerReady(); !ok {
		http.Error(w, "installer not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(desktopUpdateInfo{
		Version:     desktopVersion,
		Platform:    platform,
		DownloadURL: api.BasePath() + "/api/viewer/desktop/download",
		Notes:       desktopNotes,
		Sha256:      desktopSha256,
	})
}

func apiDesktopDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	if desktopVersion == "" {
		http.Error(w, "desktop updates not configured", http.StatusNotFound)
		return
	}

	p, ok := desktopInstallerReady()
	if !ok {
		http.Error(w, "installer not found", http.StatusNotFound)
		return
	}

	f, err := os.Open(p)
	if err != nil {
		http.Error(w, "installer not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	name := filepath.Base(p)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	w.Header().Set("Content-Length", strconv.FormatInt(st.Size(), 10))
	if desktopSha256 != "" {
		w.Header().Set("X-Sha256", desktopSha256)
	}

	_, _ = io.Copy(w, f)
}
