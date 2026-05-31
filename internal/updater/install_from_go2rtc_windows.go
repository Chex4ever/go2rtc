//go:build windows

package updater

import (
	"fmt"
	"os"

	"github.com/AlexxIT/go2rtc/internal/app"
)

// InstallUpdaterFromGo2rtc registers go2rtc-updater service using binaries beside go2rtc.
func InstallUpdaterFromGo2rtc() error {
	st, err := UpdaterServiceStatus()
	if err != nil {
		return err
	}
	if !st.UpdaterExeFound {
		if st.Message != "" {
			return fmt.Errorf("%s", st.Message)
		}
		return fmt.Errorf("go2rtc-updater.exe not found next to go2rtc.exe")
	}
	if st.Installed {
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	updaterExe, err := UpdaterExePath(exe)
	if err != nil {
		return err
	}
	if err := InstallService(updaterExe, app.ConfigPath); err != nil {
		return err
	}
	return StartService()
}
