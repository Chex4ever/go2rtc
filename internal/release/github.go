package release

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Asset is a GitHub release attachment.
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// GitHubRelease is the latest release from GitHub API.
type GitHubRelease struct {
	TagName string  `json:"tag_name"`
	Body    string  `json:"body"`
	HTMLURL string  `json:"html_url"`
	Assets  []Asset `json:"assets"`
}

// Client caches GitHub /releases/latest.
type Client struct {
	Repo string
	TTL  time.Duration
	mu   sync.Mutex
	at   time.Time
	rel  *GitHubRelease
}

func NewClient(repo string, ttl time.Duration) *Client {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &Client{Repo: NormalizeRepo(repo), TTL: ttl}
}

// NormalizeRepo accepts "org/repo" or full GitHub URL.
func NormalizeRepo(repo string) string {
	repo = strings.TrimSpace(repo)
	repo = strings.TrimPrefix(repo, "https://github.com/")
	repo = strings.TrimPrefix(repo, "http://github.com/")
	return strings.Trim(repo, "/")
}

func (c *Client) Latest() (*GitHubRelease, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.Repo == "" {
		return nil, fmt.Errorf("github repo not configured")
	}
	if c.rel != nil && time.Since(c.at) < c.TTL {
		return c.rel, nil
	}
	rel, err := FetchLatestRelease(c.Repo)
	if err != nil {
		return nil, err
	}
	c.at = time.Now()
	c.rel = rel
	return rel, nil
}

// FetchLatestRelease calls GitHub API (override in tests).
var FetchLatestRelease = func(repo string) (*GitHubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "go2rtc-updater")

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API %s: %s", res.Status, strings.TrimSpace(string(body)))
	}

	var rel GitHubRelease
	if err := json.Unmarshal(body, &rel); err != nil {
		return nil, err
	}
	if rel.TagName == "" {
		return nil, fmt.Errorf("github release missing tag_name")
	}
	return &rel, nil
}

// PickDesktopInstaller finds the Camera Wall NSIS installer on a GitHub release.
func PickDesktopInstaller(assets []Asset) (*Asset, error) {
	if len(assets) == 0 {
		return nil, fmt.Errorf("release has no assets")
	}

	best := (*Asset)(nil)
	bestScore := -1
	for i := range assets {
		lower := strings.ToLower(assets[i].Name)
		if !strings.HasSuffix(lower, ".exe") {
			continue
		}
		if strings.Contains(lower, "go2rtc-updater") || strings.HasPrefix(lower, "go2rtc_") {
			continue
		}
		score := 1
		if strings.Contains(lower, "setup") {
			score += 2
		}
		if strings.Contains(lower, "camera") || strings.Contains(lower, "wall") {
			score += 2
		}
		if score > bestScore {
			bestScore = score
			best = &assets[i]
		}
	}
	if best == nil {
		return nil, fmt.Errorf("no desktop installer asset found")
	}
	return best, nil
}

// PatchAssetName is the standard progressive-update zip name.
func PatchAssetName(from, to string) string {
	from = strings.TrimSpace(from)
	to = strings.TrimSpace(to)
	if from == "" || to == "" {
		return ""
	}
	return fmt.Sprintf("go2rtc.Camera.Wall.Patch.%s-%s.zip", from, to)
}

// PickDesktopPatch finds a shell patch zip for an exact from→to pair.
func PickDesktopPatch(assets []Asset, from, to string) (*Asset, error) {
	want := strings.ToLower(PatchAssetName(from, to))
	if want == "" {
		return nil, fmt.Errorf("invalid patch versions")
	}
	for i := range assets {
		if strings.EqualFold(assets[i].Name, want) {
			return &assets[i], nil
		}
	}
	return nil, fmt.Errorf("patch asset not found: %s", want)
}

// PickAssetByExactName finds a release asset by filename.
func PickAssetByExactName(assets []Asset, name string) (*Asset, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("empty asset name")
	}
	for i := range assets {
		if strings.EqualFold(assets[i].Name, name) {
			return &assets[i], nil
		}
	}
	return nil, fmt.Errorf("asset not found: %s", name)
}

// VersionFromTag strips leading "v".
func VersionFromTag(tag string) string {
	return strings.TrimPrefix(strings.TrimSpace(tag), "v")
}

// PickAsset finds a release asset for os/arch (windows/amd64, etc.).
func PickAsset(assets []Asset, osName, arch string) (*Asset, error) {
	if len(assets) == 0 {
		return nil, fmt.Errorf("release has no assets")
	}

	osName = strings.ToLower(osName)
	arch = strings.ToLower(arch)
	if osName == "win32" {
		osName = "windows"
	}

	var patterns []string
	switch {
	case osName == "windows" && arch == "amd64":
		patterns = []string{"windows_amd64", "win64", "win_amd64", "go2rtc_win64"}
	case osName == "windows" && arch == "386":
		patterns = []string{"windows_386", "win32", "win_386", "go2rtc_win32"}
	case osName == "windows" && arch == "arm64":
		patterns = []string{"windows_arm64", "go2rtc_win_arm64"}
	case osName == "linux" && arch == "amd64":
		patterns = []string{"linux_amd64"}
	case osName == "linux" && arch == "arm64":
		patterns = []string{"linux_arm64"}
	default:
		patterns = []string{osName + "_" + arch}
	}

	for _, pat := range patterns {
		for i := range assets {
			name := strings.ToLower(assets[i].Name)
			if strings.Contains(name, pat) {
				return &assets[i], nil
			}
		}
	}

	return nil, fmt.Errorf("no asset for %s/%s", osName, arch)
}
