//go:build !windows

package updater

import "fmt"

// ApplyWindows is only available on Windows.
func ApplyWindows(serviceName, targetExe, newExe string) error {
	return fmt.Errorf("auto-apply is only supported on Windows")
}

// ServiceExePath is only available on Windows.
func ServiceExePath(serviceName string) (string, error) {
	return "", fmt.Errorf("service query is only supported on Windows")
}
