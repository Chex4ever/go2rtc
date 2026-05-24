package viewer

import (
	"net/http"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/api"
)

func authBypassRequest(r *http.Request) bool {
	if isAdminRequest(r) && strings.Contains(r.URL.Path, "/api/streams") {
		return true
	}
	if strings.Contains(r.URL.Path, "/api/ws") {
		return resolveUser(r) != ""
	}
	return viewerStreamMediaAllowed(r)
}

// viewerStreamMediaAllowed lets logged-in users fetch snapshots/clips for allowed cameras.
func viewerStreamMediaAllowed(r *http.Request) bool {
	if r.Method != http.MethodGet {
		return false
	}
	user := resolveUser(r)
	if user == "" {
		return false
	}
	src := r.URL.Query().Get("src")
	if src == "" {
		return false
	}
	if !store.UserCanAccessStream(user, src) {
		return false
	}
	path := strings.TrimPrefix(r.URL.Path, api.BasePath())
	switch path {
	case "/api/frame.jpeg", "/api/frame.mp4", "/api/stream.mp4":
		return true
	default:
		return false
	}
}
