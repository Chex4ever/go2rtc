//go:build !windows

package updater

import "fmt"

func InstallService(updaterExe, configPath string) error {
	return fmt.Errorf("go2rtc-updater service is only supported on Windows")
}

func UninstallService() error {
	return fmt.Errorf("go2rtc-updater service is only supported on Windows")
}

func StartService() error {
	return fmt.Errorf("go2rtc-updater service is only supported on Windows")
}

func UpdaterServiceStatus() (ServiceStatus, error) {
	return ServiceStatus{
		Name:      updaterServiceName,
		Supported: false,
		Message:   "go2rtc-updater service is only supported on Windows",
	}, nil
}

func UpdaterExePath(nearExe string) (string, error) {
	return "", fmt.Errorf("go2rtc-updater is only supported on Windows")
}
