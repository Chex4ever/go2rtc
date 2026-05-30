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
	"github.com/AlexxIT/go2rtc/internal/release"
)

type desktopUpdateInfo struct {
	Version       string `json:"version"`
	ReleaseTag    string `json:"release_tag,omitempty"`
	InstallerName string `json:"installer_name,omitempty"`
	Platform      string `json:"platform"`
	DownloadURL   string `json:"download_url"`
	Notes         string `json:"notes,omitempty"`
	Sha256        string `json:"sha256,omitempty"`
	Source        string `json:"source,omitempty"`
	ReleaseURL    string `json:"release_url,omitempty"`
}

type desktopUpdateCfg struct {
	Version   string
	Installer string
	Sha256    string
	Notes     string
	Github    string
	Asset     string
	CacheTTL  time.Duration
	ghClient  *release.Client
}

var desktopUp desktopUpdateCfg

func initDesktopUpdate(cfg struct {
	Version   string `yaml:"version"`
	Installer string `yaml:"installer"`
	Sha256    string `yaml:"sha256"`
	Notes     string `yaml:"notes"`
	Github    string `yaml:"github"`
	Asset     string `yaml:"asset"`
	CacheTTL  string `yaml:"cache_ttl"`
}) {
	desktopUp.Version = strings.TrimSpace(cfg.Version)
	desktopUp.Installer = strings.TrimSpace(cfg.Installer)
	desktopUp.Sha256 = strings.TrimSpace(cfg.Sha256)
	desktopUp.Notes = strings.TrimSpace(cfg.Notes)
	desktopUp.Github = release.NormalizeRepo(cfg.Github)
	desktopUp.Asset = strings.TrimSpace(cfg.Asset)

	ttl := 10 * time.Minute
	if cfg.CacheTTL != "" {
		if d, err := time.ParseDuration(cfg.CacheTTL); err == nil {
			ttl = d
		}
	}
	desktopUp.CacheTTL = ttl

	if desktopUp.Github != "" {
		desktopUp.ghClient = release.NewClient(desktopUp.Github, ttl)
	}

	if desktopUp.Github == "" && desktopUp.Version == "" {
		return
	}

	api.HandleFunc("api/viewer/desktop/update", apiDesktopUpdate)
	api.HandleFunc("api/viewer/desktop/download", apiDesktopDownload)

	if desktopUp.Github == "" {
		if p, ok := desktopInstallerReady(); !ok && desktopUp.Installer != "" {
			if p != "" {
				log.Warn().Str("path", p).Msg("[viewer] desktop installer not found")
			} else {
				log.Warn().Str("path", desktopUp.Installer).Msg("[viewer] desktop installer path invalid (set go2rtc config path)")
			}
		}
	}

	log.Info().
		Str("github", desktopUp.Github).
		Str("version", desktopUp.Version).
		Msg("[viewer] desktop update API enabled")
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
	p := resolveInstallerPath(desktopUp.Installer)
	if p == "" {
		return "", false
	}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return p, false
	}
	return p, true
}

func resolveDesktopUpdate(platform string) (desktopUpdateInfo, error) {
	out := desktopUpdateInfo{Platform: platform}

	if desktopUp.Github != "" && desktopUp.ghClient != nil {
		rel, err := desktopUp.ghClient.Latest()
		if err != nil {
			return out, err
		}
		asset, err := release.PickDesktopInstaller(rel.Assets)
		if err != nil && desktopUp.Asset != "" {
			for i := range rel.Assets {
				if strings.EqualFold(rel.Assets[i].Name, desktopUp.Asset) {
					asset = &rel.Assets[i]
					err = nil
					break
				}
			}
		}
		if err != nil {
			return out, err
		}
		tagVersion := release.VersionFromTag(rel.TagName)
		assetVersion := release.VersionFromDesktopAsset(asset.Name)
		out.ReleaseTag = tagVersion
		out.InstallerName = asset.Name
		if assetVersion != "" {
			out.Version = assetVersion
		} else {
			out.Version = tagVersion
		}
		if tagVersion != "" && assetVersion != "" && tagVersion != assetVersion {
			log.Warn().
				Str("release_tag", tagVersion).
				Str("installer_version", assetVersion).
				Str("installer", asset.Name).
				Msg("[viewer] desktop release tag differs from installer filename — using installer version for updates")
		}
		out.DownloadURL = asset.BrowserDownloadURL
		out.Notes = strings.TrimSpace(rel.Body)
		if desktopUp.Notes != "" {
			out.Notes = desktopUp.Notes + "\n\n" + out.Notes
		}
		out.Source = "github"
		out.ReleaseURL = rel.HTMLURL
		return out, nil
	}

	if desktopUp.Version == "" {
		return out, errors.New("desktop updates not configured")
	}
	if _, ok := desktopInstallerReady(); !ok {
		return out, os.ErrNotExist
	}

	out.Version = desktopUp.Version
	out.DownloadURL = api.BasePath() + "/api/viewer/desktop/download"
	out.Notes = desktopUp.Notes
	out.Sha256 = desktopUp.Sha256
	out.Source = "local"
	return out, nil
}

func apiDesktopUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	if desktopUp.Github == "" && desktopUp.Version == "" {
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

	info, err := resolveDesktopUpdate(platform)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(info)
}

func apiDesktopDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	platform := strings.ToLower(r.URL.Query().Get("platform"))
	if platform == "" || platform == "win32" {
		platform = "windows"
	}

	info, err := resolveDesktopUpdate(platform)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if info.Source == "github" && info.DownloadURL != "" {
		http.Redirect(w, r, info.DownloadURL, http.StatusFound)
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
	if desktopUp.Sha256 != "" {
		w.Header().Set("X-Sha256", desktopUp.Sha256)
	}

	_, _ = io.Copy(w, f)
}
