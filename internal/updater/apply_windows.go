//go:build windows

package updater

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// ApplyWindows stops service, replaces target exe, starts service.
func ApplyWindows(serviceName, targetExe, newExe string) error {
	backup := targetExe + ".bak"
	_ = os.Remove(backup)

	if err := scStop(serviceName); err != nil {
		return err
	}
	if err := waitServiceStopped(serviceName, 90); err != nil {
		return err
	}

	if _, err := os.Stat(targetExe); err == nil {
		if err := os.Rename(targetExe, backup); err != nil {
			return fmt.Errorf("backup: %w", err)
		}
	}

	if err := copyFile(newExe, targetExe); err != nil {
		_ = os.Rename(backup, targetExe)
		_ = scStart(serviceName)
		return err
	}

	if err := scStart(serviceName); err != nil {
		return err
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
