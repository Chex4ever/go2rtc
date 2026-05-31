package viewer

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func setupAPI(t *testing.T) {
	t.Helper()

	dir := t.TempDir()
	path := filepath.Join(dir, "viewer.yaml")

	store = NewStore(path)
	store.Users["alice"] = &User{Password: "secret", Layouts: []string{"wall"}}
	store.Layouts["wall"] = &Layout{Grid: 6, Cameras: []string{"cam1", "cam2"}}
	require.NoError(t, store.Save())

	sessions = newSessionTable(time.Hour)
	adminPassword = "admin-secret"
	trustIPDuration = time.Hour
	cookieSecure = false
}

func TestAPI_loginAndMe(t *testing.T) {
	setupAPI(t)

	body := `{"user":"alice","password":"secret","remember":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/viewer/login", bytes.NewBufferString(body))
	req.RemoteAddr = "192.168.1.50:12345"
	w := httptest.NewRecorder()
	apiLogin(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var login loginResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &login))
	require.Equal(t, "alice", login.User)
	require.Len(t, login.Layouts, 1)

	cookie := w.Result().Cookies()
	require.NotEmpty(t, cookie)

	req2 := httptest.NewRequest(http.MethodGet, "/api/viewer/me", nil)
	req2.AddCookie(cookie[0])
	w2 := httptest.NewRecorder()
	apiMe(w2, req2)
	require.Equal(t, http.StatusOK, w2.Code)
}

func TestAPI_trustedIPAutoUser(t *testing.T) {
	setupAPI(t)

	require.NoError(t, store.TrustIP("10.0.0.5", "alice", time.Now().Add(time.Hour)))

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/me", nil)
	req.RemoteAddr = "10.0.0.5:9999"
	w := httptest.NewRecorder()
	apiMe(w, req)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestAPI_layoutGet(t *testing.T) {
	setupAPI(t)

	token, _ := sessions.Create("alice")
	req := httptest.NewRequest(http.MethodGet, "/api/viewer/layouts/wall", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})

	w := httptest.NewRecorder()
	apiLayouts(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp layoutResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Equal(t, "wall", resp.ID)
	require.Equal(t, 6, resp.Grid)
}

func TestAPI_layoutTiles(t *testing.T) {
	setupAPI(t)

	token, _ := sessions.Create("alice")
	req := httptest.NewRequest(http.MethodPut, "/api/viewer/layouts/wall/tiles", bytes.NewBufferString(
		`{"tiles":[{"stream":"cam1","x":0,"y":0,"w":1,"h":1,"view":{"fit":"cover","scale":1.2,"widthScale":1.1}}]}`,
	))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	req.URL.Path = "/api/viewer/layouts/wall/tiles"

	w := httptest.NewRecorder()
	apiLayouts(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	st := store.LayoutState("alice", "wall")
	require.Len(t, st.Tiles, 1)
	require.Equal(t, "cam1", st.Tiles[0].Stream)
	require.NotNil(t, st.Tiles[0].View)
	require.Equal(t, "cover", st.Tiles[0].View.Fit)
	require.InDelta(t, 1.2, st.Tiles[0].View.Scale, 0.001)
	require.InDelta(t, 1.1, st.Tiles[0].View.WidthScale, 0.001)
}

func TestAPI_layoutTilesViewMain(t *testing.T) {
	setupAPI(t)

	token, _ := sessions.Create("alice")
	req := httptest.NewRequest(http.MethodPut, "/api/viewer/layouts/wall/tiles", bytes.NewBufferString(
		`{"tiles":[{"stream":"cam1","x":0,"y":0,"w":1,"h":1,"view":{"fit":"contain","scale":1},"viewMain":{"fit":"cover","scale":1.8,"widthScale":1.25}}]}`,
	))
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	req.URL.Path = "/api/viewer/layouts/wall/tiles"

	w := httptest.NewRecorder()
	apiLayouts(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	st := store.LayoutState("alice", "wall")
	require.Len(t, st.Tiles, 1)
	require.NotNil(t, st.Tiles[0].View)
	require.Equal(t, "contain", st.Tiles[0].View.Fit)
	require.NotNil(t, st.Tiles[0].ViewMain)
	require.Equal(t, "cover", st.Tiles[0].ViewMain.Fit)
	require.InDelta(t, 1.8, st.Tiles[0].ViewMain.Scale, 0.001)
	require.InDelta(t, 1.25, st.Tiles[0].ViewMain.WidthScale, 0.001)
}

func TestAPI_adminRequiresHeader(t *testing.T) {
	setupAPI(t)

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/admin/users", nil)
	w := httptest.NewRecorder()
	apiAdminUsers(w, req)
	require.Equal(t, http.StatusUnauthorized, w.Code)

	req.Header.Set("X-Viewer-Admin", "admin-secret")
	w2 := httptest.NewRecorder()
	apiAdminUsers(w2, req)
	require.Equal(t, http.StatusOK, w2.Code)
}

func TestViewerStreamMediaAllowed(t *testing.T) {
	setupAPI(t)

	token, _ := sessions.Create("alice")
	req := httptest.NewRequest(http.MethodGet, "/api/frame.jpeg?src=cam1", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	require.True(t, viewerStreamMediaAllowed(req))

	req2 := httptest.NewRequest(http.MethodGet, "/api/frame.jpeg?src=denied", nil)
	req2.AddCookie(&http.Cookie{Name: cookieName, Value: token})
	require.False(t, viewerStreamMediaAllowed(req2))

	req3 := httptest.NewRequest(http.MethodGet, "/api/frame.jpeg?src=cam1", nil)
	require.False(t, viewerStreamMediaAllowed(req3))
}
