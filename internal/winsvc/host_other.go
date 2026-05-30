//go:build !windows

package winsvc

import "context"

// Host is unused on non-Windows platforms.
type Host struct {
	Name string
	Run  func(ctx context.Context) error
}

func IsWindowsService() (bool, error) {
	return false, nil
}

func Run(_ Host) error {
	return nil
}
