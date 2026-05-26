package viewer

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
)

type go2rtcUpdateInfo struct {
	RunningVersion string `json:"running_version"`
	Version        string `json:"version"`
	Platform       string `json:"platform"`
	Arch           string `json:"arch"`
	DownloadURL    string `json:"download_url"`
	Notes          string `json:"notes,omitempty"`
	Sha256         string `json:"sha256,omitempty"`
	Source         string `json:"source"`
	ReleaseURL     string `json:"release_url,omitempty"`
}

type go2rtcUpdateCfg struct {
	Version   string
	Binary    string
	Sha256    string
	Notes     string
	Github    string
	Asset     string
	CacheTTL  time.Duration
	ghClient  *ghReleaseClient
}

var go2rtcUp go2rtcUpdateCfg

func initGo2rtcUpdate(cfg struct {
	Version  string `yaml:"version"`
	Binary   string `yaml:"binary"`
	Sha256   string `yaml:"sha256"`
	Notes    string `yaml:"notes"`
	Github   string `yaml:"github"`
	Asset    string `yaml:"asset"`
	CacheTTL string `yaml:"cache_ttl"`
}) {
	go2rtcUp.Version = strings.TrimSpace(cfg.Version)
	go2rtcUp.Binary = strings.TrimSpace(cfg.Binary)
	go2rtcUp.Sha256 = strings.TrimSpace(cfg.Sha256)
	go2rtcUp.Notes = strings.TrimSpace(cfg.Notes)
	go2rtcUp.Github = normalizeGithubRepo(cfg.Github)
	go2rtcUp.Asset = strings.TrimSpace(cfg.Asset)

	ttl := 10 * time.Minute
	if cfg.CacheTTL != "" {
		if d, err := time.ParseDuration(cfg.CacheTTL); err == nil {
			ttl = d
		}
	}
	go2rtcUp.CacheTTL = ttl

	if go2rtcUp.Github != "" {
		go2rtcUp.ghClient = newGhReleaseClient(go2rtcUp.Github, ttl)
	}

	if go2rtcUp.Github == "" && go2rtcUp.Version == "" {
		return
	}

	api.HandleFunc("api/viewer/go2rtc/update", apiGo2rtcUpdate)
	api.HandleFunc("api/viewer/go2rtc/download", apiGo2rtcDownload)

	log.Info().
		Str("github", go2rtcUp.Github).
		Str("version", go2rtcUp.Version).
		Msg("[viewer] go2rtc update API enabled")
}

func resolveBinaryPath(binary string) string {
	if binary == "" {
		return ""
	}
	if filepath.IsAbs(binary) {
		return filepath.Clean(binary)
	}
	if app.ConfigPath != "" {
		return filepath.Clean(filepath.Join(filepath.Dir(app.ConfigPath), binary))
	}
	return ""
}

func go2rtcBinaryReady() (string, bool) {
	p := resolveBinaryPath(go2rtcUp.Binary)
	if p == "" {
		return "", false
	}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return p, false
	}
	return p, true
}

func parsePlatformArch(r *http.Request) (platform, arch string) {
	platform = strings.ToLower(r.URL.Query().Get("platform"))
	arch = strings.ToLower(r.URL.Query().Get("arch"))
	if platform == "" || platform == "win32" {
		platform = "windows"
	}
	if arch == "" {
		arch = "amd64"
	}
	return platform, arch
}

func resolveGo2rtcUpdate(platform, arch string) (go2rtcUpdateInfo, error) {
	out := go2rtcUpdateInfo{
		RunningVersion: app.Version,
		Platform:       platform,
		Arch:           arch,
	}

	if go2rtcUp.Github != "" && go2rtcUp.ghClient != nil {
		rel, err := go2rtcUp.ghClient.Latest()
		if err != nil {
			return out, err
		}
		asset, err := pickGithubAsset(rel.Assets, platform, arch)
		if err != nil && go2rtcUp.Asset != "" {
			for i := range rel.Assets {
				if strings.EqualFold(rel.Assets[i].Name, go2rtcUp.Asset) {
					asset = &rel.Assets[i]
					err = nil
					break
				}
			}
		}
		if err != nil {
			return out, err
		}
		out.Version = releaseVersion(rel.TagName)
		out.DownloadURL = asset.BrowserDownloadURL
		out.Notes = strings.TrimSpace(rel.Body)
		if go2rtcUp.Notes != "" {
			out.Notes = go2rtcUp.Notes + "\n\n" + out.Notes
		}
		out.Source = "github"
		out.ReleaseURL = rel.HTMLURL
		return out, nil
	}

	if go2rtcUp.Version == "" {
		return out, errors.New("go2rtc updates not configured")
	}
	if _, ok := go2rtcBinaryReady(); !ok {
		return out, os.ErrNotExist
	}

	out.Version = go2rtcUp.Version
	out.DownloadURL = api.BasePath() + "/api/viewer/go2rtc/download?platform=" + platform + "&arch=" + arch
	out.Notes = go2rtcUp.Notes
	out.Sha256 = go2rtcUp.Sha256
	out.Source = "local"
	return out, nil
}

func apiGo2rtcUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	if go2rtcUp.Github == "" && go2rtcUp.Version == "" {
		http.Error(w, "go2rtc updates not configured", http.StatusNotFound)
		return
	}

	platform, arch := parsePlatformArch(r)
	info, err := resolveGo2rtcUpdate(platform, arch)
	if err != nil {
		if err.Error() == "go2rtc updates not configured" {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(info)
}

func apiGo2rtcDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	platform, arch := parsePlatformArch(r)
	info, err := resolveGo2rtcUpdate(platform, arch)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if info.Source == "github" && info.DownloadURL != "" {
		http.Redirect(w, r, info.DownloadURL, http.StatusFound)
		return
	}

	p, ok := go2rtcBinaryReady()
	if !ok {
		http.Error(w, "binary not found", http.StatusNotFound)
		return
	}

	f, err := os.Open(p)
	if err != nil {
		http.Error(w, "binary not found", http.StatusNotFound)
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
	if info.Sha256 != "" {
		w.Header().Set("X-Sha256", info.Sha256)
	}
	_, _ = io.Copy(w, f)
}
