package viewer

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/AlexxIT/go2rtc/internal/api"
)

type loginRequest struct {
	User     string `json:"user"`
	Password string `json:"password"`
	Remember bool   `json:"remember"`
}

type loginResponse struct {
	User    string          `json:"user"`
	Layouts []layoutSummary `json:"layouts"`
}

type layoutSummary struct {
	ID      string   `json:"id"`
	Grid    int      `json:"grid"`
	Cameras []string `json:"cameras"`
}

type meResponse struct {
	User    string          `json:"user"`
	Layouts []layoutSummary `json:"layouts"`
}

type layoutResponse struct {
	ID      string   `json:"id"`
	Grid    int      `json:"grid"`
	Cameras []string `json:"cameras"`
	Tiles   []Tile   `json:"tiles"`
}

type tilesRequest struct {
	Tiles []Tile `json:"tiles"`
}

func layoutsForUser(user string) []layoutSummary {
	ids := store.LayoutsForUser(user)
	out := make([]layoutSummary, 0, len(ids))
	for _, id := range ids {
		l, ok := store.Layout(id)
		if !ok || l == nil {
			continue
		}
		out = append(out, layoutSummary{
			ID:      id,
			Grid:    l.Grid,
			Cameras: append([]string(nil), l.Cameras...),
		})
	}
	return out
}

func apiLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.User == "" || req.Password == "" {
		http.Error(w, "user and password required", http.StatusBadRequest)
		return
	}

	if !store.CheckPassword(req.User, req.Password) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	token, expires := sessions.Create(req.User)
	setSessionCookie(w, token, expires)

	if req.Remember {
		ip := clientIP(r)
		_ = store.TrustIP(ip, req.User, time.Now().Add(trustIPDuration))
		_ = store.Save()
	}

	api.ResponseJSON(w, loginResponse{
		User:    req.User,
		Layouts: layoutsForUser(req.User),
	})
}

func apiLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	if token := sessionToken(r); token != "" {
		sessions.Delete(token)
	}
	clearSessionCookie(w)

	if r.URL.Query().Get("forget") == "1" {
		store.UntrustIP(clientIP(r))
		_ = store.Save()
	}

	api.Response(w, "OK", api.MimeText)
}

func apiMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "", http.StatusMethodNotAllowed)
		return
	}

	user, ok := requireUser(w, r)
	if !ok {
		return
	}

	// Trusted IP without session: issue session for the browser.
	if sessionToken(r) == "" {
		token, expires := sessions.Create(user)
		setSessionCookie(w, token, expires)
	}

	api.ResponseJSON(w, meResponse{
		User:    user,
		Layouts: layoutsForUser(user),
	})
}

func apiLayouts(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}

	base := api.BasePath() + "/api/viewer/layouts"
	path := r.URL.Path

	if path == base || path == base+"/" {
		if r.Method != http.MethodGet {
			http.Error(w, "", http.StatusMethodNotAllowed)
			return
		}
		api.ResponseJSON(w, layoutsForUser(user))
		return
	}

	rest := strings.TrimPrefix(path, base+"/")
	parts := strings.Split(rest, "/")
	if len(parts) < 1 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	layoutID := parts[0]
	if !store.UserCanAccessLayout(user, layoutID) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	layout, ok := store.Layout(layoutID)
	if !ok || layout == nil {
		http.NotFound(w, r)
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			st := store.LayoutState(user, layoutID)
			api.ResponseJSON(w, layoutResponse{
				ID:      layoutID,
				Grid:    layout.Grid,
				Cameras: append([]string(nil), layout.Cameras...),
				Tiles:   st.Tiles,
			})
		default:
			http.Error(w, "", http.StatusMethodNotAllowed)
		}
		return
	}

	if len(parts) == 2 && parts[1] == "tiles" {
		switch r.Method {
		case http.MethodPut:
			var body tilesRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := validateTiles(body.Tiles, layout); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := store.SetLayoutState(user, layoutID, &LayoutState{Tiles: body.Tiles}); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
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

	http.NotFound(w, r)
}

func validateTiles(tiles []Tile, layout *Layout) error {
	allowed := map[string]bool{}
	for _, c := range layout.Cameras {
		allowed[c] = true
	}
	for _, t := range tiles {
		if t.Stream == "" {
			return errInvalidTile
		}
		if !allowed[t.Stream] {
			return errCameraNotAllowed
		}
	}
	return nil
}

var (
	errInvalidTile       = errString("invalid tile")
	errCameraNotAllowed  = errString("camera not allowed on layout")
)

type errString string

func (e errString) Error() string { return string(e) }
