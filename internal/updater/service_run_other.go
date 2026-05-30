//go:build !windows

package updater

// RunWindowsService is a no-op on non-Windows platforms.
func RunWindowsService(_ Config) error {
	return nil
}
