//go:build windows

package winsvc

import (
	"context"
	"fmt"

	"golang.org/x/sys/windows/svc"
)

// Host runs a function as a Windows service after SCM start.
type Host struct {
	Name string
	Run  func(ctx context.Context) error
}

// IsWindowsService reports whether the current process was started by SCM.
func IsWindowsService() (bool, error) {
	return svc.IsWindowsService()
}

// Run blocks until the service stops. Call only when IsWindowsService is true.
func Run(host Host) error {
	if host.Name == "" {
		return fmt.Errorf("service name required")
	}
	if host.Run == nil {
		return fmt.Errorf("service run function required")
	}
	return svc.Run(host.Name, &serviceHandler{host: host})
}

type serviceHandler struct {
	host Host
}

func (h *serviceHandler) Execute(_ []string, r <-chan svc.ChangeRequest, s chan<- svc.Status) (bool, uint32) {
	const accepts = svc.AcceptStop | svc.AcceptShutdown
	s <- svc.Status{State: svc.StartPending}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = h.host.Run(ctx)
	}()

	s <- svc.Status{State: svc.Running, Accepts: accepts}

loop:
	for {
		select {
		case <-done:
			break loop
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				s <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				s <- svc.Status{State: svc.StopPending, Accepts: accepts}
				cancel()
				<-done
				s <- svc.Status{State: svc.Stopped}
				return false, 0
			default:
			}
		}
	}

	s <- svc.Status{State: svc.Stopped}
	return false, 0
}
