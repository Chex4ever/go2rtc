package service

import (
	"net/http"

	"github.com/AlexxIT/go2rtc/internal/api"
	"github.com/AlexxIT/go2rtc/internal/app"
)

const serviceName = "go2rtc"

// Status describes OS service installation state.
type Status struct {
	Supported bool   `json:"supported"`
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Name      string `json:"name"`
	Message   string `json:"message,omitempty"`
}

func Init() {
	if !Supported() {
		return
	}
	api.HandleFunc("api/service", apiService)
}

func apiService(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		st, err := GetStatus()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, st)
	case http.MethodPost:
		action := r.URL.Query().Get("action")
		var err error
		switch action {
		case "install":
			err = Install()
		case "uninstall":
			err = Uninstall()
		case "start":
			err = Start()
		case "stop":
			err = Stop()
		default:
			http.Error(w, "action must be install, uninstall, start, or stop", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		st, err := GetStatus()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.ResponseJSON(w, st)
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func exeArgs() []string {
	args := []string{}
	if app.ConfigPath != "" {
		args = append(args, "-config", app.ConfigPath)
	}
	return args
}
