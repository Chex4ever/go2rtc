//go:build windows

package updater

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// ServiceExePath returns the go2rtc.exe path from service BINARY_PATH_NAME.
func ServiceExePath(serviceName string) (string, error) {
	cmd := exec.Command("sc", "qc", serviceName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sc qc %s: %s", serviceName, strings.TrimSpace(string(out)))
	}
	for _, line := range strings.Split(string(out), "\n") {
		upper := strings.ToUpper(line)
		if !strings.Contains(upper, "BINARY_PATH_NAME") {
			continue
		}
		_, path, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		path = strings.TrimSpace(path)
		return parseExeFromBinPath(path)
	}
	return "", fmt.Errorf("BINARY_PATH_NAME not found for service %s", serviceName)
}

func parseExeFromBinPath(bin string) (string, error) {
	bin = strings.TrimSpace(bin)
	if bin == "" {
		return "", fmt.Errorf("empty binPath")
	}
	if bin[0] == '"' {
		end := strings.Index(bin[1:], `"`)
		if end >= 0 {
			return bin[1 : 1+end], nil
		}
	}
	parts := strings.Fields(bin)
	for _, p := range parts {
		if strings.HasSuffix(strings.ToLower(p), ".exe") {
			return p, nil
		}
	}
	return parts[0], nil
}

func scStop(name string) error {
	return runSc("stop", name)
}

func scStart(name string) error {
	return runSc("start", name)
}

func waitServiceStopped(name string, timeoutSec int) error {
	for i := 0; i < timeoutSec; i++ {
		out, err := scQuery(name)
		if err != nil {
			return err
		}
		if !strings.Contains(strings.ToUpper(out), "RUNNING") {
			return nil
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("service %s still running after %ds", name, timeoutSec)
}

func scQuery(name string) (string, error) {
	cmd := exec.Command("sc", "query", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("sc query: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func runSc(args ...string) error {
	cmd := exec.Command("sc", args...)
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if strings.Contains(text, "1062") || strings.Contains(text, "1056") {
			return nil
		}
		return fmt.Errorf("sc %s: %s", strings.Join(args, " "), text)
	}
	return nil
}
