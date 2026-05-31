package updater

import "sync"

// InstallJob tracks a background install-updater request from the Settings UI.
type InstallJob struct {
	Running bool   `json:"running"`
	Done    bool   `json:"done"`
	Error   string `json:"error,omitempty"`
}

var (
	installJobMu sync.Mutex
	installJob   InstallJob
)

// StartInstallJob runs InstallUpdaterFromGo2rtc in the background.
func StartInstallJob() bool {
	installJobMu.Lock()
	defer installJobMu.Unlock()
	if installJob.Running {
		return false
	}
	installJob = InstallJob{Running: true}
	go func() {
		err := InstallUpdaterFromGo2rtc()
		installJobMu.Lock()
		defer installJobMu.Unlock()
		installJob.Running = false
		installJob.Done = true
		if err != nil {
			installJob.Error = err.Error()
		}
	}()
	return true
}

// GetInstallJob returns the current install job state.
func GetInstallJob() InstallJob {
	installJobMu.Lock()
	defer installJobMu.Unlock()
	return installJob
}

// ClearInstallJob clears a finished job so the UI can retry.
func ClearInstallJob() {
	installJobMu.Lock()
	defer installJobMu.Unlock()
	if installJob.Running {
		return
	}
	installJob = InstallJob{}
}
