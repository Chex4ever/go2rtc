//go:build !windows

package updater

import "fmt"

// CheckNowFromGo2rtc checks for a newer go2rtc build using updater config.
func CheckNowFromGo2rtc(cfg Config) (CheckResult, error) {
	return CheckResult{}, fmt.Errorf("manual go2rtc update check is only supported on Windows")
}

// ApplyNowFromGo2rtc runs go2rtc-updater run-once.
func ApplyNowFromGo2rtc() error {
	return fmt.Errorf("manual go2rtc update apply is only supported on Windows")
}
