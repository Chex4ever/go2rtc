package updater

import (
	"fmt"
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
		st, err := UpdaterServiceStatus()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
	case "check-now":
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		cfg := loadAppUpdaterConfig()
		cr, err := CheckNowFromGo2rtc(cfg)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]any{
			"running_version":   cr.Running,
			"available_version": cr.Latest,
			"needs_update":      cr.Needs,
			"source":            cr.Source,
			"release_url":       cr.Release,
			"message":           checkNowMessage(cr),
		})
	case "apply-now":
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		if err := ApplyNowFromGo2rtc(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, map[string]string{
			"ok":      "true",
			"message": "Update started. go2rtc will restart when complete. Approve UAC if Windows prompts.",
		})
	default:
		http.Error(w, "action: updater-status, install-updater, uninstall-updater, check-now, apply-now", http.StatusBadRequest)
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

func checkNowMessage(cr CheckResult) string {
	if cr.Needs {
		return fmt.Sprintf("update available: %s → %s", cr.Running, cr.Latest)
	}
	return fmt.Sprintf("running %s, latest %s", cr.Running, cr.Latest)
}
