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
	UpdateKind    string `json:"update_kind,omitempty"`
	ShellChanged  bool   `json:"shell_changed"`
	PatchFrom     string `json:"patch_from,omitempty"`
	PatchURL      string `json:"patch_url,omitempty"`
	PatchSha256   string `json:"patch_sha256,omitempty"`
}

type desktopUpdateMeta struct {
	Version      string `json:"version"`
	From         string `json:"from"`
	To           string `json:"to"`
	ShellChanged bool   `json:"shell_changed"`
	UpdateKind   string `json:"update_kind"`
	PatchFile    string `json:"patch_file"`
	PatchSha256  string `json:"patch_sha256"`
}

type desktopUpdateCfg struct {
	Version      string
	Installer    string
	Sha256       string
	Notes        string
	Github       string
	Asset        string
	CacheTTL     time.Duration
	Patch        string
	PatchFrom    string
	PatchSha256  string
	ShellChanged *bool
	ghClient     *release.Client
}

var desktopUp desktopUpdateCfg

func initDesktopUpdate(cfg struct {
	Version      string `yaml:"version"`
	Installer    string `yaml:"installer"`
	Sha256       string `yaml:"sha256"`
	Notes        string `yaml:"notes"`
	Github       string `yaml:"github"`
	Asset        string `yaml:"asset"`
	CacheTTL     string `yaml:"cache_ttl"`
	Patch        string `yaml:"patch"`
	PatchFrom    string `yaml:"patch_from"`
	PatchSha256  string `yaml:"patch_sha256"`
	ShellChanged *bool  `yaml:"shell_changed"`
}) {
	desktopUp.Version = strings.TrimSpace(cfg.Version)
	desktopUp.Installer = strings.TrimSpace(cfg.Installer)
	desktopUp.Sha256 = strings.TrimSpace(cfg.Sha256)
	desktopUp.Notes = strings.TrimSpace(cfg.Notes)
	desktopUp.Github = release.NormalizeRepo(cfg.Github)
	desktopUp.Asset = strings.TrimSpace(cfg.Asset)
	desktopUp.Patch = strings.TrimSpace(cfg.Patch)
	desktopUp.PatchFrom = strings.TrimSpace(cfg.PatchFrom)
	desktopUp.PatchSha256 = strings.TrimSpace(cfg.PatchSha256)
	desktopUp.ShellChanged = cfg.ShellChanged

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
	api.HandleFunc("api/viewer/desktop/patch/download", apiDesktopPatchDownload)

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

func desktopPatchReady() (string, bool) {
	p := resolveInstallerPath(desktopUp.Patch)
	if p == "" {
		return "", false
	}
	st, err := os.Stat(p)
	if err != nil || st.IsDir() {
		return p, false
	}
	return p, true
}

func loadDesktopUpdateMeta(assets []release.Asset, version string) *desktopUpdateMeta {
	name := "desktop-update-meta-" + version + ".json"
	asset, err := release.PickAssetByExactName(assets, name)
	if err != nil {
		return nil
	}
	body, err := release.FetchAssetBytes(asset.BrowserDownloadURL)
	if err != nil {
		log.Warn().Err(err).Str("asset", name).Msg("[viewer] desktop update meta download failed")
		return nil
	}
	var meta desktopUpdateMeta
	if err := json.Unmarshal(body, &meta); err != nil {
		log.Warn().Err(err).Str("asset", name).Msg("[viewer] desktop update meta parse failed")
		return nil
	}
	return &meta
}

func classifyDesktopUpdate(out *desktopUpdateInfo, fromVersion string, assets []release.Asset, meta *desktopUpdateMeta) {
	out.UpdateKind = "full"
	out.ShellChanged = true

	fromVersion = strings.TrimSpace(fromVersion)
	if fromVersion == "" {
		return
	}

	if meta != nil {
		out.ShellChanged = meta.ShellChanged
	}

	if patch, err := release.PickDesktopPatch(assets, fromVersion, out.Version); err == nil {
		out.UpdateKind = "patch"
		out.PatchFrom = fromVersion
		out.PatchURL = patch.BrowserDownloadURL
		out.ShellChanged = true
		if meta != nil && strings.EqualFold(meta.PatchFile, patch.Name) {
			out.PatchSha256 = strings.TrimSpace(meta.PatchSha256)
		}
		return
	}

	if meta != nil && strings.EqualFold(meta.UpdateKind, "none") && strings.EqualFold(fromVersion, meta.From) {
		out.UpdateKind = "none"
		out.ShellChanged = false
		return
	}

	if meta != nil && strings.EqualFold(meta.UpdateKind, "full") {
		out.UpdateKind = "full"
		out.ShellChanged = meta.ShellChanged
	}
}

func classifyLocalDesktopUpdate(out *desktopUpdateInfo, fromVersion string) {
	out.UpdateKind = "full"
	out.ShellChanged = true
	if desktopUp.ShellChanged != nil {
		out.ShellChanged = *desktopUp.ShellChanged
	}

	fromVersion = strings.TrimSpace(fromVersion)
	if fromVersion == "" {
		return
	}

	if desktopUp.Patch != "" && desktopUp.PatchFrom != "" &&
		strings.EqualFold(fromVersion, desktopUp.PatchFrom) &&
		release.CompareSemver(out.Version, fromVersion) > 0 {
		if _, ok := desktopPatchReady(); ok {
			out.UpdateKind = "patch"
			out.PatchFrom = desktopUp.PatchFrom
			out.PatchURL = api.BasePath() + "/api/viewer/desktop/patch/download?from=" + fromVersion
			out.PatchSha256 = desktopUp.PatchSha256
			out.ShellChanged = true
			return
		}
	}

	if desktopUp.ShellChanged != nil && !*desktopUp.ShellChanged {
		out.UpdateKind = "none"
		out.ShellChanged = false
	}
}

func resolveDesktopUpdate(platform, fromVersion string) (desktopUpdateInfo, error) {
	out := desktopUpdateInfo{Platform: platform, ShellChanged: true, UpdateKind: "full"}

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

		meta := loadDesktopUpdateMeta(rel.Assets, out.Version)
		classifyDesktopUpdate(&out, fromVersion, rel.Assets, meta)
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
	classifyLocalDesktopUpdate(&out, fromVersion)
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

	fromVersion := strings.TrimSpace(r.URL.Query().Get("from"))
	info, err := resolveDesktopUpdate(platform, fromVersion)
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

	info, err := resolveDesktopUpdate(platform, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if info.Source == "github" && info.DownloadURL != "" {
		http.Redirect(w, r, info.DownloadURL, http.StatusFound)
		return
	}

	serveLocalFile(w, desktopUp.Installer, desktopUp.Sha256)
}

func apiDesktopPatchDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	fromVersion := strings.TrimSpace(r.URL.Query().Get("from"))
	info, err := resolveDesktopUpdate("windows", fromVersion)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	if info.UpdateKind != "patch" {
		http.Error(w, "patch not available", http.StatusNotFound)
		return
	}
	if info.Source == "github" && info.PatchURL != "" {
		http.Redirect(w, r, info.PatchURL, http.StatusFound)
		return
	}
	serveLocalFile(w, desktopUp.Patch, desktopUp.PatchSha256)
}

func serveLocalFile(w http.ResponseWriter, relPath, sha256sum string) {
	p, ok := func() (string, bool) {
		if relPath == desktopUp.Installer {
			return desktopInstallerReady()
		}
		if relPath == desktopUp.Patch {
			return desktopPatchReady()
		}
		path := resolveInstallerPath(relPath)
		if path == "" {
			return "", false
		}
		st, err := os.Stat(path)
		if err != nil || st.IsDir() {
			return path, false
		}
		return path, true
	}()
	if !ok {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}

	f, err := os.Open(p)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
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
	if sha256sum != "" {
		w.Header().Set("X-Sha256", sha256sum)
	}

	_, _ = io.Copy(w, f)
}
