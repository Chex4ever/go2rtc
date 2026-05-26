//go:build windows

package updater

import (
	"os"

	"github.com/AlexxIT/go2rtc/internal/app"
)

// InstallUpdaterFromGo2rtc registers go2rtc-updater service using binaries beside go2rtc.
func InstallUpdaterFromGo2rtc() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	updaterExe, err := UpdaterExePath(exe)
	if err != nil {
		return err
	}
	return InstallService(updaterExe, app.ConfigPath)
}
