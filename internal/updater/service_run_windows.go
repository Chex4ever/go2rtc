//go:build windows

package updater

import (
	"context"
	"os/signal"
	"syscall"

	"github.com/AlexxIT/go2rtc/internal/winsvc"
)

// RunWindowsService runs the updater loop under SCM when started as a service.
func RunWindowsService(cfg Config) error {
	runLoop := func(ctx context.Context) error {
		NewRunner(cfg).RunLoop(ctx)
		return nil
	}

	isService, err := winsvc.IsWindowsService()
	if err != nil {
		return err
	}
	if !isService {
		ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer cancel()
		return runLoop(ctx)
	}

	return winsvc.Run(winsvc.Host{Name: updaterServiceName, Run: runLoop})
}
