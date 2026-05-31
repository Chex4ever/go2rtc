package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/AlexxIT/go2rtc/internal/release"
	"github.com/rs/zerolog"
)

// CheckResult describes available update.
type CheckResult struct {
	Running  string
	Latest   string
	Needs    bool
	URL      string
	Notes    string
	Source   string
	Release  string
	Asset    string
	Sha256   string
}

// Runner performs update checks and apply.
type Runner struct {
	Config Config
	Log    zerolog.Logger
	gh     *release.Client
}

func NewRunner(cfg Config) *Runner {
	cfg.Normalize()
	return &Runner{
		Config: cfg,
		Log:    zerolog.New(os.Stdout).With().Timestamp().Logger(),
		gh:     release.NewClient(cfg.Github, cfg.CacheTTLDuration()),
	}
}

func (r *Runner) writeStatus(state, msg string, cr *CheckResult) {
	st := Status{
		State:     state,
		Message:   msg,
		LastCheck: time.Now().UTC().Format(time.RFC3339),
	}
	if cr != nil {
		st.RunningVersion = cr.Running
		st.AvailableVersion = cr.Latest
		st.ReleaseURL = cr.Release
	}
	_ = r.Config.WriteStatus(st)
}

// Check returns whether a newer build is available.
func (r *Runner) Check(ctx context.Context) (CheckResult, error) {
	running, err := r.fetchRunningVersion(ctx)
	if err != nil {
		r.writeStatus("error", err.Error(), nil)
		return CheckResult{}, err
	}

	var cr CheckResult
	cr.Running = running

	if r.Config.Github != "" {
		rel, err := r.gh.Latest()
		if err != nil {
			r.writeStatus("error", err.Error(), &cr)
			return cr, err
		}
		asset, err := release.PickAsset(rel.Assets, runtime.GOOS, runtime.GOARCH)
		if err != nil {
			r.writeStatus("error", err.Error(), &cr)
			return cr, err
		}
		cr.Latest = release.VersionFromTag(rel.TagName)
		cr.URL = asset.BrowserDownloadURL
		cr.Notes = rel.Body
		cr.Release = rel.HTMLURL
		cr.Asset = asset.Name
		cr.Source = "github"
	} else if r.Config.Version != "" {
		cr.Latest = r.Config.Version
		cr.Source = "local"
		cr.Sha256 = r.Config.Sha256
		if r.Config.Binary != "" {
			cr.URL = r.Config.Binary
		}
	} else {
		err := fmt.Errorf("updater: set github or version+binary in config")
		r.writeStatus("error", err.Error(), &cr)
		return cr, err
	}

	cr.Needs = release.IsNewer(cr.Latest, cr.Running)
	if !cr.Needs {
		r.writeStatus("current", fmt.Sprintf("running %s, latest %s", cr.Running, cr.Latest), &cr)
	} else {
		r.writeStatus("available", fmt.Sprintf("update %s → %s", cr.Running, cr.Latest), &cr)
	}
	return cr, nil
}

func (r *Runner) fetchRunningVersion(ctx context.Context) (string, error) {
	url := r.Config.APIURL + "/api"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("cannot reach go2rtc API at %s: %w", url, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("go2rtc API %s returned %s", url, res.Status)
	}
	var info map[string]any
	if err := json.NewDecoder(res.Body).Decode(&info); err != nil {
		return "", err
	}
	v, _ := info["version"].(string)
	if v == "" {
		return "", fmt.Errorf("go2rtc API has no version field")
	}
	return v, nil
}

func (r *Runner) download(ctx context.Context, url string, dest string, wantSha string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: %s", url, res.Status)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	h := sha256.New()
	w := io.MultiWriter(f, h)
	if _, err := io.Copy(w, res.Body); err != nil {
		_ = f.Close()
		_ = os.Remove(dest)
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if wantSha != "" {
		got := hex.EncodeToString(h.Sum(nil))
		if !stringsEqualFold(got, wantSha) {
			_ = os.Remove(dest)
			return fmt.Errorf("sha256 mismatch")
		}
	}
	return nil
}

func stringsEqualFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if ca >= 'A' && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if cb >= 'A' && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}

// Apply downloads (if needed) and replaces go2rtc binary while service is stopped.
func (r *Runner) Apply(ctx context.Context, cr CheckResult) error {
	if !cr.Needs {
		return nil
	}
	if runtime.GOOS != "windows" {
		return fmt.Errorf("auto-apply is only implemented on Windows")
	}

	target, err := r.resolveTarget()
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(target), "go2rtc-update-*.exe")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	_ = tmp.Close()

	url := cr.URL
	if cr.Source == "local" && !filepath.IsAbs(url) {
		if r.Config.Binary != "" {
			url = r.Config.Binary
		}
	}
	if url == "" {
		return fmt.Errorf("no download URL")
	}
	if cr.Source == "local" && !hasHTTPPrefix(url) {
		src, err := filepath.Abs(url)
		if err != nil {
			return err
		}
		data, err := os.ReadFile(src)
		if err != nil {
			return err
		}
		if err := os.WriteFile(tmpPath, data, 0o755); err != nil {
			return err
		}
	} else {
		sha := cr.Sha256
		if sha == "" {
			sha = r.Config.Sha256
		}
		if err := r.download(ctx, url, tmpPath, sha); err != nil {
			_ = os.Remove(tmpPath)
			return err
		}
	}

	r.writeStatus("applying", fmt.Sprintf("updating %s", target), &cr)

	if err := ApplyWindows(r.Config.Service, target, tmpPath); err != nil {
		_ = os.Remove(tmpPath)
		r.writeStatus("error", err.Error(), &cr)
		return err
	}
	_ = os.Remove(tmpPath)

	st := Status{
		State:            "updated",
		Message:          fmt.Sprintf("updated to %s", cr.Latest),
		RunningVersion:   cr.Latest,
		AvailableVersion: cr.Latest,
		LastApply:        time.Now().UTC().Format(time.RFC3339),
		LastCheck:        time.Now().UTC().Format(time.RFC3339),
		ReleaseURL:       cr.Release,
	}
	_ = r.Config.WriteStatus(st)
	r.Log.Info().Str("version", cr.Latest).Str("target", target).Msg("go2rtc updated")
	return nil
}

func hasHTTPPrefix(s string) bool {
	return len(s) > 7 && (s[:7] == "http://" || (len(s) > 8 && s[:8] == "https://"))
}

func (r *Runner) resolveTarget() (string, error) {
	if r.Config.Target != "" {
		return filepath.Clean(r.Config.Target), nil
	}
	return ServiceExePath(r.Config.Service)
}

// RunOnce checks and optionally applies (respects enabled and auto_apply).
func (r *Runner) RunOnce(ctx context.Context) error {
	if !r.Config.Enabled {
		r.writeStatus("disabled", "updater.enabled is false", nil)
		return nil
	}
	cr, err := r.Check(ctx)
	if err != nil {
		return err
	}
	if cr.Needs && r.Config.AutoApply {
		return r.Apply(ctx, cr)
	}
	return nil
}

// RunApplyOnce checks and applies when a newer build exists (manual apply from Settings).
// Ignores enabled and auto_apply.
func (r *Runner) RunApplyOnce(ctx context.Context) error {
	cr, err := r.Check(ctx)
	if err != nil {
		return err
	}
	if !cr.Needs {
		r.writeStatus("current", fmt.Sprintf("already running %s (latest %s)", cr.Running, cr.Latest), &cr)
		return nil
	}
	return r.Apply(ctx, cr)
}

// RunLoop ticks until ctx cancelled.
func (r *Runner) RunLoop(ctx context.Context) {
	interval := r.Config.IntervalDuration()
	r.Log.Info().Dur("interval", interval).Msg("go2rtc-updater started")
	tick := time.NewTicker(interval)
	defer tick.Stop()

	r.RunOnce(ctx)
	for {
		select {
		case <-ctx.Done():
			r.Log.Info().Msg("go2rtc-updater stopped")
			return
		case <-tick.C:
			_ = r.RunOnce(ctx)
		}
	}
}
