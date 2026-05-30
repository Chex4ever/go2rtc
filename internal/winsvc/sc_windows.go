//go:build windows

package winsvc

import (
	"fmt"
	"os/exec"
	"strings"
)

// RunSc executes sc.exe. Mutating commands (create/delete/start/stop) retry with
// a UAC elevation prompt when the current process is not an administrator.
func RunSc(mutating bool, args ...string) error {
	err := runScDirect(args...)
	if err == nil || !mutating || !IsAccessDenied(err.Error()) {
		return err
	}
	if IsAdmin() {
		return err
	}
	if elevErr := runScElevated(args...); elevErr != nil {
		return fmt.Errorf("%s (%v)", AdminRequiredHint(""), elevErr)
	}
	return nil
}

// QueryService runs "sc query" for the given service name.
func QueryService(name string) (string, error) {
	cmd := exec.Command("sc", "query", name)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(text, "1060") {
			return "", nil
		}
		return "", fmt.Errorf("sc query: %s", text)
	}
	return text, nil
}

func IsAdmin() bool {
	cmd := exec.Command("powershell", "-NoProfile", "-Command",
		"([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "True"
}

func runScDirect(args ...string) error {
	cmd := exec.Command("sc", args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(text, "1073") || strings.Contains(text, "1056") || strings.Contains(text, "1062") {
			return nil
		}
		return fmt.Errorf("sc %s: %s", strings.Join(args, " "), text)
	}
	return nil
}

func runScElevated(args ...string) error {
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = "'" + strings.ReplaceAll(a, "'", "''") + "'"
	}
	script := fmt.Sprintf(
		"$ErrorActionPreference='Stop'; "+
			"try { "+
			"$p = Start-Process -FilePath sc.exe -ArgumentList @(%s) -Verb RunAs -Wait -PassThru; "+
			"if (-not $p) { exit 1223 }; "+
			"exit $p.ExitCode "+
			"} catch { exit 1223 }",
		strings.Join(quoted, ","),
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
