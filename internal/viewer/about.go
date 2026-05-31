package viewer

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
)

// ViewerUIVersion is the embedded camera wall web UI bundle version (www/viewer).
const ViewerUIVersion = "1.2.30"

type updateSourceSummary struct {
	Source  string `json:"source"`
	Github  string `json:"github,omitempty"`
	Version string `json:"version,omitempty"`
}

type aboutFeatures struct {
	TileDebug bool `json:"tile_debug"`
	About     bool `json:"about"`
}

type aboutInfo struct {
	Go2rtcVersion   string               `json:"go2rtc_version"`
	ViewerUIVersion string               `json:"viewer_ui_version"`
	ViewerConfig    string               `json:"viewer_config,omitempty"`
	Features        aboutFeatures        `json:"features"`
	Updates         aboutUpdatesSummary  `json:"updates"`
	ServerTime      string               `json:"server_time"`
	Build           string               `json:"build,omitempty"`
}

type aboutUpdatesSummary struct {
	Desktop *updateSourceSummary `json:"desktop,omitempty"`
	Go2rtc  *updateSourceSummary `json:"go2rtc,omitempty"`
}

var viewerConfigPath string

func initAbout(configPath string) {
	viewerConfigPath = configPath
	api.HandleFunc("api/viewer/about", apiAbout)
}

func apiAbout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	out := aboutInfo{
		Go2rtcVersion:   app.Version,
		ViewerUIVersion: ViewerUIVersion,
		ViewerConfig:    viewerConfigPath,
		Features: aboutFeatures{
			TileDebug: true,
			About:     true,
		},
		Updates: aboutUpdatesSummary{
			Desktop: summarizeUpdateSource(desktopUp.Github, desktopUp.Version),
			Go2rtc:  summarizeUpdateSource(go2rtcUp.Github, go2rtcUp.Version),
		},
		ServerTime: time.Now().UTC().Format(time.RFC3339),
		Build:      app.UserAgent,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func summarizeUpdateSource(github, version string) *updateSourceSummary {
	if github != "" {
		return &updateSourceSummary{Source: "github", Github: github}
	}
	if version != "" {
		return &updateSourceSummary{Source: "local", Version: version}
	}
	return nil
}
