//go:build windows

package updater

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/AlexxIT/go2rtc/internal/app"
	"github.com/AlexxIT/go2rtc/internal/winsvc"
)

// CheckNowFromGo2rtc checks for a newer go2rtc build using updater config.
func CheckNowFromGo2rtc(cfg Config) (CheckResult, error) {
	cfg.Normalize()
	r := NewRunner(cfg)
	return r.Check(context.Background())
}

// ApplyNowFromGo2rtc runs go2rtc-updater apply-once (stop service, replace exe, restart).
func ApplyNowFromGo2rtc() error {
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
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	updaterExe, err := UpdaterExePath(exe)
	if err != nil {
		return err
	}
	cfgPath := app.ConfigPath
	if cfgPath == "" {
		return fmt.Errorf("go2rtc started without -config; cannot run updater")
	}
	cfgPath, err = filepath.Abs(cfgPath)
	if err != nil {
		return err
	}
	return spawnUpdaterCmd(updaterExe, cfgPath, "apply-once", true)
}

func spawnUpdaterCmd(updaterExe, configPath, subcommand string, detached bool) error {
	args := []string{subcommand, "-config", configPath}
	err := runUpdaterDirect(updaterExe, args, detached)
	if err == nil {
		return nil
	}
	msg := err.Error()
	if !winsvc.IsAccessDenied(msg) || winsvc.IsAdmin() {
		return err
	}
	if elevErr := runUpdaterElevated(updaterExe, args, detached); elevErr != nil {
		return fmt.Errorf("%s (%v)", winsvc.AdminRequiredHint(""), elevErr)
	}
	return nil
}

func runUpdaterDirect(exe string, args []string, detached bool) error {
	cmd := exec.Command(exe, args...)
	if detached {
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil
		return cmd.Start()
	}
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if text != "" {
			return fmt.Errorf("%s: %s", filepath.Base(exe), text)
		}
		return err
	}
	return nil
}

func runUpdaterElevated(exe string, args []string, detached bool) error {
	quoted := make([]string, len(args)+1)
	quoted[0] = "'" + strings.ReplaceAll(exe, "'", "''") + "'"
	for i, a := range args {
		quoted[i+1] = "'" + strings.ReplaceAll(a, "'", "''") + "'"
	}
	waitFlag := "$true"
	if detached {
		waitFlag = "$false"
	}
	script := fmt.Sprintf(
		"$ErrorActionPreference='Stop'; "+
			"try { "+
			"$p = Start-Process -FilePath %s -ArgumentList @(%s) -Verb RunAs -PassThru -Wait:%s; "+
			"if (-not $p) { exit 1223 }; "+
			"if ($p.ExitCode -and $p.ExitCode -ne 0) { exit $p.ExitCode } "+
			"} catch { exit 1223 }",
		quoted[0],
		strings.Join(quoted[1:], ","),
		waitFlag,
	)
	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1223 {
			return fmt.Errorf("UAC prompt was cancelled or denied")
		}
		if text != "" {
			return fmt.Errorf("%s", text)
		}
		return err
	}
	return nil
}
