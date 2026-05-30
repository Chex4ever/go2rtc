package viewer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/stretchr/testify/require"
)

func TestApiAbout(t *testing.T) {
	app.Version = "1.2.5-test"
	viewerConfigPath = "viewer.yaml"
	desktopUp = desktopUpdateCfg{Github: "org/repo"}
	go2rtcUp = go2rtcUpdateCfg{Version: "9.9.9"}

	req := httptest.NewRequest(http.MethodGet, "/api/viewer/about", nil)
	rec := httptest.NewRecorder()
	apiAbout(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var info aboutInfo
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &info))
	require.Equal(t, "1.2.5-test", info.Go2rtcVersion)
	require.Equal(t, ViewerUIVersion, info.ViewerUIVersion)
	require.True(t, info.Features.TileDebug)
	require.True(t, info.Features.About)
	require.Equal(t, "github", info.Updates.Desktop.Source)
	require.Equal(t, "local", info.Updates.Go2rtc.Source)
	require.NotEmpty(t, info.ServerTime)
}
