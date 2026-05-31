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
	case "install-job":
		job := GetInstallJob()
		if job.Done && job.Error == "" {
			st, _ := UpdaterServiceStatus()
			if st.Installed {
				ClearInstallJob()
			}
		}
		api.ResponseJSON(w, GetInstallJob())
	case "install-updater":
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		st, err := UpdaterServiceStatus()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !st.UpdaterExeFound {
			http.Error(w, st.Message, http.StatusBadRequest)
			return
		}
		if st.Installed {
			api.ResponseJSON(w, st)
			return
		}
		if !StartInstallJob() {
			w.WriteHeader(http.StatusAccepted)
			api.ResponseJSON(w, GetInstallJob())
			return
		}
		w.WriteHeader(http.StatusAccepted)
		api.ResponseJSON(w, map[string]string{
			"status":  "installing",
			"message": "Approve the Windows UAC prompt if shown. Waiting for service registration…",
		})
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
		http.Error(w, "action: updater-status, install-updater, uninstall-updater, install-job", http.StatusBadRequest)
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
