package viewer

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/api"
)

type userPublic struct {
	Layouts []string `json:"layouts"`
}

type userAdmin struct {
	Password string   `json:"password,omitempty"`
	Layouts  []string `json:"layouts"`
}

func apiAdminConfig(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		store.mu.RLock()
		cfg := store.Config
		store.mu.RUnlock()
		api.ResponseJSON(w, cfg)
	case http.MethodPut:
		data, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var cfg Config
		if err = json.Unmarshal(data, &cfg); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		normalizeConfig(&cfg)
		if err = validateAdminConfig(&cfg); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		store.mu.Lock()
		store.Config = cfg
		store.mu.Unlock()
		if err = store.Save(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.Response(w, "OK", api.MimeText)
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func validateAdminConfig(cfg *Config) error {
	for id, l := range cfg.Layouts {
		if l == nil {
			continue
		}
		if !ValidGrid(l.Grid) {
			return errString("layout " + id + ": grid must be 6, 7, 25, or 36")
		}
		if len(l.Cameras) > l.Grid {
			return errString("layout " + id + ": more cameras than grid slots")
		}
		cameraSet := map[string]bool{}
		for _, cam := range l.Cameras {
			cameraSet[cam] = true
		}
		for main, preview := range l.Preview {
			if !cameraSet[main] {
				return errString("layout " + id + ": preview key not in cameras: " + main)
			}
			if preview == "" || preview == main {
				return errString("layout " + id + ": invalid preview for " + main)
			}
		}
	}
	for name, u := range cfg.Users {
		if u == nil {
			continue
		}
		for _, layoutID := range u.Layouts {
			if _, ok := cfg.Layouts[layoutID]; !ok {
				return errString("user " + name + ": unknown layout " + layoutID)
			}
		}
	}
	return nil
}

func apiAdminUsers(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}

	base := api.BasePath() + "/api/viewer/admin/users"
	path := r.URL.Path

	if path == base || path == base+"/" {
		switch r.Method {
		case http.MethodGet:
			store.mu.RLock()
			out := make(map[string]userPublic, len(store.Users))
			for name, u := range store.Users {
				if u == nil {
					continue
				}
				out[name] = userPublic{Layouts: append([]string(nil), u.Layouts...)}
			}
			store.mu.RUnlock()
			api.ResponseJSON(w, out)
		case http.MethodPut:
			var body struct {
				Name     string `json:"name"`
				Password string `json:"password"`
				Layouts  []string `json:"layouts"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if body.Name == "" {
				http.Error(w, "name required", http.StatusBadRequest)
				return
			}
			store.mu.Lock()
			u, ok := store.Users[body.Name]
			if !ok || u == nil {
				u = &User{}
				store.Users[body.Name] = u
			}
			if body.Password != "" {
				u.Password = body.Password
			}
			u.Layouts = body.Layouts
			store.mu.Unlock()
			if err := store.Save(); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			api.Response(w, "OK", api.MimeText)
		default:
			http.Error(w, "", http.StatusMethodNotAllowed)
		}
		return
	}

	name := strings.TrimPrefix(path, base+"/")
	if name == "" || strings.Contains(name, "/") {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		store.mu.Lock()
		delete(store.Users, name)
		delete(store.UserLayoutState, name)
		store.mu.Unlock()
		if err := store.Save(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.Response(w, "OK", api.MimeText)
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func apiAdminLayouts(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}

	base := api.BasePath() + "/api/viewer/admin/layouts"
	path := r.URL.Path

	if path == base || path == base+"/" {
		switch r.Method {
		case http.MethodGet:
			store.mu.RLock()
			out := make(map[string]*Layout, len(store.Layouts))
			for id, l := range store.Layouts {
				if l == nil {
					continue
				}
				out[id] = cloneLayout(l)
			}
			store.mu.RUnlock()
			api.ResponseJSON(w, out)
		case http.MethodPut:
			var body struct {
				ID      string            `json:"id"`
				Grid    int               `json:"grid"`
				Cameras []string          `json:"cameras"`
				Preview map[string]string `json:"preview"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if body.ID == "" {
				http.Error(w, "id required", http.StatusBadRequest)
				return
			}
			if !ValidGrid(body.Grid) {
				http.Error(w, "grid must be 6, 7, 25, or 36", http.StatusBadRequest)
				return
			}
			if len(body.Cameras) > body.Grid {
				http.Error(w, "too many cameras for grid", http.StatusBadRequest)
				return
			}
			layout := &Layout{
				Grid:    body.Grid,
				Cameras: append([]string(nil), body.Cameras...),
			}
			if len(body.Preview) > 0 {
				layout.Preview = map[string]string{}
				cameraSet := map[string]bool{}
				for _, cam := range body.Cameras {
					cameraSet[cam] = true
				}
				for main, preview := range body.Preview {
					if !cameraSet[main] || preview == "" || preview == main {
						continue
					}
					layout.Preview[main] = preview
				}
				if len(layout.Preview) == 0 {
					layout.Preview = nil
				}
			}
			store.mu.Lock()
			store.Layouts[body.ID] = layout
			store.mu.Unlock()
			if err := store.Save(); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			api.Response(w, "OK", api.MimeText)
		default:
			http.Error(w, "", http.StatusMethodNotAllowed)
		}
		return
	}

	id := strings.TrimPrefix(path, base+"/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		store.mu.Lock()
		delete(store.Layouts, id)
		for _, byUser := range store.UserLayoutState {
			delete(byUser, id)
		}
		for _, u := range store.Users {
			if u == nil {
				continue
			}
			u.Layouts = removeString(u.Layouts, id)
		}
		store.mu.Unlock()
		if err := store.Save(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		api.Response(w, "OK", api.MimeText)
	default:
		http.Error(w, "", http.StatusMethodNotAllowed)
	}
}

func removeString(ss []string, s string) []string {
	out := ss[:0]
	for _, v := range ss {
		if v != s {
			out = append(out, v)
		}
	}
	return out
}

func cloneLayout(l *Layout) *Layout {
	if l == nil {
		return nil
	}
	out := &Layout{
		Grid:    l.Grid,
		Cameras: append([]string(nil), l.Cameras...),
	}
	if len(l.Preview) > 0 {
		out.Preview = map[string]string{}
		for k, v := range l.Preview {
			out.Preview[k] = v
		}
	}
	return out
}
