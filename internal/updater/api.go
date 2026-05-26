package updater

import (
	"net/http"
	"os"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
)

// Init exposes updater status and control on the running go2rtc HTTP API.
func Init() {
	api.HandleFunc("api/updater/status", apiUpdaterStatus)
	api.HandleFunc("api/updater", apiUpdaterControl)
}

func apiUpdaterStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	cfg := loadAppUpdaterConfig()
	path := cfg.statusPath()
	st, err := ReadStatusFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			api.ResponseJSON(w, Status{State: "unknown", Message: "updater service not reporting yet"})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	api.ResponseJSON(w, st)
}

func apiUpdaterControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}
	action := r.URL.Query().Get("action")
	switch action {
	case "updater-status":
		st, err := UpdaterServiceStatus()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, st)
	case "install-updater":
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		if err := InstallUpdaterFromGo2rtc(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		st, _ := UpdaterServiceStatus()
		api.ResponseJSON(w, st)
	case "uninstall-updater":
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		if err := UninstallService(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]string{"ok": "true"})
	default:
		http.Error(w, "action: updater-status, install-updater, uninstall-updater", http.StatusBadRequest)
	}
}

func loadAppUpdaterConfig() Config {
	cfg := DefaultConfig()
	if app.ConfigPath == "" {
		cfg.Normalize()
		return cfg
	}
	loaded, err := LoadConfigFromYAML(app.ConfigPath)
	if err != nil {
		cfg.Normalize()
		return cfg
	}
	loaded.Normalize()
	return loaded
}
