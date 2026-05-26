package viewer

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type ghRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt string    `json:"published_at"`
	Assets      []ghAsset `json:"assets"`
}

type ghReleaseClient struct {
	repo string
	ttl  time.Duration
	mu   sync.Mutex
	at   time.Time
	rel  *ghRelease
	err  error
}

func newGhReleaseClient(repo string, ttl time.Duration) *ghReleaseClient {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &ghReleaseClient{repo: normalizeGithubRepo(repo), ttl: ttl}
}

func normalizeGithubRepo(repo string) string {
	repo = strings.TrimSpace(repo)
	repo = strings.TrimPrefix(repo, "https://github.com/")
	repo = strings.TrimPrefix(repo, "http://github.com/")
	repo = strings.Trim(repo, "/")
	return repo
}

func (c *ghReleaseClient) Latest() (*ghRelease, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.repo == "" {
		return nil, fmt.Errorf("github repo not configured")
	}
	if c.rel != nil && time.Since(c.at) < c.ttl {
		return c.rel, nil
	}

	rel, err := fetchGithubLatestRelease(c.repo)
	c.at = time.Now()
	c.rel = rel
	c.err = err
	if err != nil {
		return nil, err
	}
	return rel, nil
}

var fetchGithubLatestRelease = func(repo string) (*ghRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "go2rtc-viewer-update")

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

	var rel ghRelease
	if err := json.Unmarshal(body, &rel); err != nil {
		return nil, err
	}
	if rel.TagName == "" {
		return nil, fmt.Errorf("github release missing tag_name")
	}
	return &rel, nil
}

func releaseVersion(tag string) string {
	return strings.TrimPrefix(strings.TrimSpace(tag), "v")
}

func pickGithubAsset(assets []ghAsset, osName, arch string) (*ghAsset, error) {
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
	case osName == "darwin" && arch == "amd64":
		patterns = []string{"darwin_amd64", "mac_amd64"}
	case osName == "darwin" && arch == "arm64":
		patterns = []string{"darwin_arm64", "mac_arm64"}
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
