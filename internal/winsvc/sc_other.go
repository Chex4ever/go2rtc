//go:build !windows

package winsvc

// RunSc is a no-op on non-Windows platforms.
func RunSc(mutating bool, args ...string) error {
	return nil
}

// QueryService returns empty output on non-Windows platforms.
func QueryService(name string) (string, error) {
	return "", nil
}
