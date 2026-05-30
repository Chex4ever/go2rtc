package release

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// FetchAssetBytes downloads a small release attachment (override in tests).
var FetchAssetBytes = func(url string) ([]byte, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil, fmt.Errorf("empty asset URL")
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "go2rtc-viewer-update")

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("asset download %s: %s", res.Status, strings.TrimSpace(string(body)))
	}
	return body, nil
}
