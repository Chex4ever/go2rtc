package winsvc

import (
	"errors"
	"fmt"
	"strings"
)

// ErrAdminRequired is returned when a Windows service operation needs elevation.
var ErrAdminRequired = errors.New("administrator privileges required")

// IsAccessDenied reports Service Control Manager "access denied" (Win32 error 5).
func IsAccessDenied(output string) bool {
	s := strings.ToLower(output)
	if strings.Contains(s, "access is denied") ||
		strings.Contains(s, "access denied") ||
		strings.Contains(s, "отказано в доступе") ||
		strings.Contains(s, "error 5") ||
		strings.Contains(s, ": 5:") {
		return true
	}
	return strings.Contains(s, "openscmanager") &&
		(strings.Contains(s, "denied") || strings.Contains(s, ": 5"))
}

// AdminRequiredHint formats guidance for operators when elevation is needed.
func AdminRequiredHint(cliExample string) string {
	if cliExample == "" {
		return fmt.Sprintf("%v: approve the Windows UAC prompt, or run an elevated Command Prompt as Administrator", ErrAdminRequired)
	}
	return fmt.Sprintf("%v: approve the Windows UAC prompt, or run an elevated Command Prompt: %s", ErrAdminRequired, cliExample)
}
