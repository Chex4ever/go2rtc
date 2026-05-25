//go:build windows

package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/app"
)

func Supported() bool { return true }

func GetStatus() (Status, error) {
	st := Status{Supported: true, Name: serviceName}
	out, err := scQuery()
	if err != nil {
		return st, err
	}
	if out == "" {
		st.Message = "Service not installed"
		return st, nil
	}
	st.Installed = true
	upper := strings.ToUpper(out)
	st.Running = strings.Contains(upper, "RUNNING")
	if !st.Running && strings.Contains(upper, "STOPPED") {
		st.Message = "Service installed but stopped"
	} else if st.Running {
		st.Message = "Service running"
	}
	return st, nil
}

func Install() error {
	if st, err := GetStatus(); err != nil {
		return err
	} else if st.Installed {
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}

	binPath := exe
	if app.ConfigPath != "" {
		cfg, err := filepath.Abs(app.ConfigPath)
		if err != nil {
			return err
		}
		binPath += " -config " + cfg
	}
	if strings.Contains(binPath, " ") {
		binPath = `"` + binPath + `"`
	}

	if err = runSc("create", serviceName, "binPath=", binPath, "start=", "auto", "DisplayName=", "go2rtc"); err != nil {
		return err
	}
	return Start()
}

func Uninstall() error {
	if st, err := GetStatus(); err != nil {
		return err
	} else if !st.Installed {
		return nil
	}
	_ = runSc("stop", serviceName)
	return runSc("delete", serviceName)
}

func Start() error {
	return runSc("start", serviceName)
}

func Stop() error {
	if st, err := GetStatus(); err != nil {
		return err
	} else if !st.Installed {
		return fmt.Errorf("service is not installed")
	}
	return runSc("stop", serviceName)
}

func scQuery() (string, error) {
	cmd := exec.Command("sc", "query", serviceName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "1060") {
			return "", nil
		}
		return "", fmt.Errorf("sc query: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func runSc(args ...string) error {
	cmd := exec.Command("sc", args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(text, "1073") || strings.Contains(text, "1056") {
			return nil
		}
		if strings.Contains(text, "1062") {
			return nil
		}
		return fmt.Errorf("sc %s: %s", strings.Join(args, " "), text)
	}
	return nil
}
