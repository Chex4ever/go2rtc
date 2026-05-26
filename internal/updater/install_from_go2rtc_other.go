//go:build !windows

package updater

import "fmt"

func InstallUpdaterFromGo2rtc() error {
	return fmt.Errorf("go2rtc-updater service is only supported on Windows")
}
