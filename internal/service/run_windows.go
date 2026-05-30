//go:build windows

package service

import (
	"context"
	"log"

	"github.com/AlexxIT/go2rtc/internal/winsvc"
)

// TryRun starts go2rtc under SCM when launched as a Windows service.
// Returns true if this process handled service lifetime and main should exit.
func TryRun(start func()) bool {
	isService, err := winsvc.IsWindowsService()
	if err != nil || !isService {
		return false
	}

	run := func(ctx context.Context) error {
		start()
		<-ctx.Done()
		return nil
	}

	if err := winsvc.Run(winsvc.Host{Name: serviceName, Run: run}); err != nil {
		log.Fatalf("windows service: %v", err)
	}
	return true
}
