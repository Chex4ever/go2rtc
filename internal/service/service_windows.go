//go:build windows

package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/AlexxIT/go2rtc/internal/winsvc"
)

func Supported() bool { return true }

func GetStatus() (Status, error) {
	st := Status{Supported: true, Name: serviceName}
	out, err := winsvc.QueryService(serviceName)
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

	if err = winsvc.RunSc(true, "create", serviceName, "binPath=", binPath, "start=", "auto", "DisplayName=", "go2rtc"); err != nil {
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
	_ = winsvc.RunSc(true, "stop", serviceName)
	return winsvc.RunSc(true, "delete", serviceName)
}

func Start() error {
	return winsvc.RunSc(true, "start", serviceName)
}

func Stop() error {
	if st, err := GetStatus(); err != nil {
		return err
	} else if !st.Installed {
		return fmt.Errorf("service is not installed")
	}
	return winsvc.RunSc(true, "stop", serviceName)
}
