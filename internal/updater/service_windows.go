//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

	return runScUpdater("create", updaterServiceName,
		"binPath=", bin,
		"start=", "auto",
		"DisplayName=", "go2rtc auto-updater",
	)
}

// UninstallService removes go2rtc-updater service.
func UninstallService() error {
	_ = runScUpdater("stop", updaterServiceName)
	return runScUpdater("delete", updaterServiceName)
}

// StartService starts go2rtc-updater service.
func StartService() error {
	return runScUpdater("start", updaterServiceName)
}

// UpdaterServiceStatus reports installation state.
func UpdaterServiceStatus() (ServiceStatus, error) {
	st := ServiceStatus{Name: updaterServiceName, Supported: true}
	out, err := scQueryUpdater()
	if err != nil {
		return st, err
	}
	if out == "" {
		st.Message = "Updater service not installed"
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

// ServiceStatus for API.
type ServiceStatus struct {
	Supported bool   `json:"supported"`
	Installed bool   `json:"installed"`
	Running   bool   `json:"running"`
	Name      string `json:"name"`
	Message   string `json:"message,omitempty"`
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

func scQueryUpdater() (string, error) {
	cmd := exec.Command("sc", "query", updaterServiceName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "1060") {
			return "", nil
		}
		return "", fmt.Errorf("sc query: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func runScUpdater(args ...string) error {
	cmd := exec.Command("sc", args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(text, "1073") || strings.Contains(text, "1062") {
			return nil
		}
		return fmt.Errorf("sc %s: %s", strings.Join(args, " "), text)
	}
	return nil
}
