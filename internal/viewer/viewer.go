package viewer

import (
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/rs/zerolog"
)

type ctxKey int

const userCtxKey ctxKey = 1

func Init() {
	var cfg struct {
		Mod struct {
			Config       string `yaml:"config"`
			AdminPass    string `yaml:"admin_password"`
			SessionTTL   string `yaml:"session_ttl"`
			TrustIPTTL   string `yaml:"trust_ip_ttl"`
			CookieSecure bool   `yaml:"cookie_secure"`
			Desktop      struct {
				Version   string `yaml:"version"`
				Installer string `yaml:"installer"`
				Sha256    string `yaml:"sha256"`
				Notes     string `yaml:"notes"`
			} `yaml:"desktop"`
		} `yaml:"viewer"`
	}

	app.LoadConfig(&cfg)

	log = app.GetLogger("viewer")

	path := cfg.Mod.Config
	if path == "" {
		path = "viewer.yaml"
	}
	path = resolvePath(path)

	sessionTTL := 24 * time.Hour
	if cfg.Mod.SessionTTL != "" {
		if d, err := time.ParseDuration(cfg.Mod.SessionTTL); err == nil {
			sessionTTL = d
		}
	}

	trustTTL := 30 * 24 * time.Hour
	if cfg.Mod.TrustIPTTL != "" {
		if d, err := time.ParseDuration(cfg.Mod.TrustIPTTL); err == nil {
			trustTTL = d
		}
	}

	store = NewStore(path)
	if err := store.Load(); err != nil {
		log.Error().Err(err).Str("path", path).Msg("[viewer] load config")
		return
	}
	if err := store.Save(); err != nil {
		log.Warn().Err(err).Msg("[viewer] create config file")
	}

	sessions = newSessionTable(sessionTTL)
	adminPassword = cfg.Mod.AdminPass
	cookieSecure = cfg.Mod.CookieSecure
	trustIPDuration = trustTTL

	prefix := api.BasePath() + "/api/viewer"
	api.AuthBypassPrefix(prefix)
	api.AuthBypassPrefix(api.BasePath() + "/viewer")

	api.AuthBypassRequest(authBypassRequest)

	log.Info().Str("path", path).Msg("[viewer] config")

	api.HandleFunc("api/viewer/login", apiLogin)
	api.HandleFunc("api/viewer/logout", apiLogout)
	api.HandleFunc("api/viewer/me", apiMe)
	// Go 1.22+ mux: trailing slash required for subpaths (e.g. /layouts/{id}).
	api.HandleFunc("api/viewer/layouts", apiLayouts)
	api.HandleFunc("api/viewer/layouts/", apiLayouts)
	api.HandleFunc("api/viewer/admin/users", apiAdminUsers)
	api.HandleFunc("api/viewer/admin/users/", apiAdminUsers)
	api.HandleFunc("api/viewer/admin/layouts", apiAdminLayouts)
	api.HandleFunc("api/viewer/admin/layouts/", apiAdminLayouts)
	api.HandleFunc("api/viewer/admin/config", apiAdminConfig)

	initDesktopUpdate(cfg.Mod.Desktop)
}

var (
	log              zerolog.Logger
	store            *Store
	sessions         *sessionTable
	adminPassword    string
	cookieSecure     bool
	trustIPDuration  time.Duration
)

func resolvePath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	if app.ConfigPath != "" {
		return filepath.Join(filepath.Dir(app.ConfigPath), path)
	}
	return path
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func cookiePath() string {
	p := api.BasePath()
	if p == "" {
		return "/"
	}
	return p + "/"
}

func setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     cookiePath(),
		HttpOnly: true,
		Secure:   cookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     cookiePath(),
		HttpOnly: true,
		Secure:   cookieSecure,
		MaxAge:   -1,
	})
}

func sessionToken(r *http.Request) string {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

func resolveUser(r *http.Request) string {
	if token := sessionToken(r); token != "" {
		if user, ok := sessions.User(token); ok {
			return user
		}
	}

	store.PruneExpiredTrust()
	if user, ok := store.UserForTrustedIP(clientIP(r)); ok {
		return user
	}
	return ""
}

func requireUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	user := resolveUser(r)
	if user == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return user, true
}

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !isAdminRequest(r) {
		if adminPassword == "" {
			http.Error(w, "viewer admin disabled", http.StatusForbidden)
		} else {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
		}
		return false
	}
	return true
}

func isAdminRequest(r *http.Request) bool {
	if adminPassword == "" {
		return false
	}
	return r.Header.Get("X-Viewer-Admin") == adminPassword
}
