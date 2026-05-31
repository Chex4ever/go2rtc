//go:build windows

package updater

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/winsvc"
)

// InstallService registers Windows service go2rtc-updater.
func InstallService(updaterExe, configPath string) error {
	if st, err := UpdaterServiceStatus(); err != nil {
		return err
	} else if st.Installed {
		return nil
	}

	updaterExe, err := filepath.Abs(updaterExe)
	if err != nil {
		return err
	}
	bin := `"` + updaterExe + `" run-service`
	if configPath != "" {
		cfg, err := filepath.Abs(configPath)
		if err != nil {
			return err
		}
		bin += ` -config "` + cfg + `"`
	}

	return winsvc.RunSc(true, "create", updaterServiceName,
		"binPath=", bin,
		"start=", "auto",
		"DisplayName=", "go2rtc auto-updater",
	)
}

// UninstallService removes go2rtc-updater service.
func UninstallService() error {
	_ = winsvc.RunSc(true, "stop", updaterServiceName)
	return winsvc.RunSc(true, "delete", updaterServiceName)
}

// StartService starts go2rtc-updater service.
func StartService() error {
	return winsvc.RunSc(true, "start", updaterServiceName)
}

// UpdaterServiceStatus reports installation state.
func UpdaterServiceStatus() (ServiceStatus, error) {
	st := ServiceStatus{Name: updaterServiceName, Supported: true}
	fillUpdaterExeInfo(&st)
	out, err := winsvc.QueryService(updaterServiceName)
	if err != nil {
		return st, err
	}
	if out == "" {
		if !st.UpdaterExeFound && st.Message == "" {
			st.Message = "go2rtc-updater.exe not found next to go2rtc.exe"
		} else if st.Message == "" {
			st.Message = "Updater service not installed"
		}
		return st, nil
	}
	st.Installed = true
	upper := strings.ToUpper(out)
	st.Running = strings.Contains(upper, "RUNNING")
	if st.Running {
		st.Message = "Updater service running"
	} else {
		st.Message = "Updater service installed but stopped"
	}
	return st, nil
}

func fillUpdaterExeInfo(st *ServiceStatus) {
	if st == nil {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	path, err := UpdaterExePath(exe)
	if err != nil {
		if st.Message == "" {
			st.Message = err.Error()
		}
		return
	}
	st.UpdaterExeFound = true
	st.UpdaterExePath = path
}

// UpdaterExePath finds go2rtc-updater.exe next to go2rtc.exe or in same dir as given path.
func UpdaterExePath(nearExe string) (string, error) {
	dir := filepath.Dir(nearExe)
	p := filepath.Join(dir, "go2rtc-updater.exe")
	if _, err := os.Stat(p); err == nil {
		return p, nil
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	p = filepath.Join(filepath.Dir(exe), "go2rtc-updater.exe")
	if _, err := os.Stat(p); err != nil {
		return "", fmt.Errorf("go2rtc-updater.exe not found next to %s", nearExe)
	}
	return p, nil
}
