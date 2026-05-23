package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"syscall"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUseExecFirst(t *testing.T) {
	require.False(t, useExecFirst("windows"), "Windows must spawn a new process (syscall.Exec is unsupported)")
	require.True(t, useExecFirst("linux"))
	require.True(t, useExecFirst("darwin"))
}

func TestRestartHandler(t *testing.T) {
	t.Run("POST returns OK", func(t *testing.T) {
		scheduleRestartFn = func(string) {}
		t.Cleanup(func() { scheduleRestartFn = defaultScheduleRestart })

		req := httptest.NewRequest(http.MethodPost, "/api/restart", nil)
		w := httptest.NewRecorder()

		restartHandler(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, "text/plain", w.Header().Get("Content-Type"))
		require.Equal(t, "OK", w.Body.String())
	})

	t.Run("GET is rejected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/restart", nil)
		w := httptest.NewRecorder()

		restartHandler(w, req)

		require.Equal(t, http.StatusBadRequest, w.Code)
	})
}

// TestRestartProcess_spawnChild verifies that when syscall.Exec fails (as on Windows),
// restart spawns a new process instead of leaving the old one running with stale config.
func TestRestartProcess_spawnChild(t *testing.T) {
	if os.Getenv("GO2RTC_RESTART_CHILD") == "1" {
		os.Exit(0)
	}

	syscallExec = func(string, []string, []string) error {
		return syscall.EWINDOWS
	}
	t.Cleanup(func() { syscallExec = syscall.Exec })

	exitCode := -1
	osExit = func(code int) { exitCode = code }
	t.Cleanup(func() { osExit = func(code int) { os.Exit(code) } })

	testArgs := []string{os.Args[0], "-test.run=^TestRestartProcess_spawnChild$", "-test.count=1"}
	oldArgs := os.Args
	os.Args = testArgs
	t.Cleanup(func() { os.Args = oldArgs })

	t.Setenv("GO2RTC_RESTART_CHILD", "1")

	path, err := os.Executable()
	require.NoError(t, err)
	restartProcess(path)

	require.Equal(t, 0, exitCode)
}

func TestRestartProcess_windowsSkipsExec(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows-specific regression")
	}

	execCalled := false
	syscallExec = func(string, []string, []string) error {
		execCalled = true
		return nil
	}
	t.Cleanup(func() { syscallExec = syscall.Exec })

	exitCode := -1
	osExit = func(code int) { exitCode = code }
	t.Cleanup(func() { osExit = func(code int) { os.Exit(code) } })

	// Invalid path: we only assert Exec was not attempted; spawn fails before exit.
	restartProcess("")

	require.False(t, execCalled, "Windows must not call syscall.Exec")
	require.Equal(t, -1, exitCode, "spawn failure must not exit the process")
}
