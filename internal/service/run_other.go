//go:build !windows

package service

func TryRun(_ func()) bool {
	return false
}
