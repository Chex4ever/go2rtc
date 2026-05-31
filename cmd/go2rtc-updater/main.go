package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/AlexxIT/go2rtc/internal/updater"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Set at link time: -X main.version=1.2.26
var version = "dev"

func main() {
	flag.Usage = func() {
		fmt.Printf(`go2rtc-updater %s — automatic go2rtc.exe updates (Windows service)

Usage:
  go2rtc-updater run-service          Run check loop (for Windows service)
  go2rtc-updater run-once -config PATH  Single check/apply
  go2rtc-updater check -config PATH     Check only
  go2rtc-updater install-service -config PATH
  go2rtc-updater uninstall-service
  go2rtc-updater status

Config: same go2rtc.yaml with top-level updater: section.
`, version)
	}

	configPath := flag.String("config", "", "path to go2rtc.yaml")
	flag.Parse()

	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(2)
	}

	cmd := args[0]
	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("config")
	}

	switch cmd {
	case "run-service":
		if err := updater.RunWindowsService(cfg); err != nil {
			log.Fatal().Err(err).Msg("run-service")
		}
	case "run-once":
		runOnce(cfg)
	case "check":
		cfg.AutoApply = false
		runOnce(cfg)
	case "install-service":
		installSvc(*configPath)
	case "uninstall-service":
		if err := updater.UninstallService(); err != nil {
			log.Fatal().Err(err).Msg("uninstall")
		}
		log.Info().Msg("go2rtc-updater service removed")
	case "status":
		st, err := updater.UpdaterServiceStatus()
		if err != nil {
			log.Fatal().Err(err).Msg("status")
		}
		log.Info().Interface("service", st).Msg("updater service")
	default:
		log.Fatal().Str("cmd", cmd).Msg("unknown command")
	}
}

func loadConfig(path string) (updater.Config, error) {
	if path == "" {
		path = os.Getenv("GO2RTC_CONFIG")
	}
	if path == "" {
		path = "go2rtc.yaml"
	}
	cfg, err := updater.LoadConfigFromYAML(path)
	if err != nil {
		return updater.DefaultConfig(), err
	}
	return cfg, nil
}

func runOnce(cfg updater.Config) {
	r := updater.NewRunner(cfg)
	ctx := context.Background()
	if err := r.RunOnce(ctx); err != nil {
		log.Fatal().Err(err).Msg("run")
	}
	log.Info().Msg("done")
}

func installSvc(configPath string) {
	updaterExe, err := os.Executable()
	if err != nil {
		log.Fatal().Err(err).Msg("exe")
	}
	if err := updater.InstallService(updaterExe, configPath); err != nil {
		log.Fatal().Err(err).Msg("install")
	}
	if err := updater.StartService(); err != nil {
		log.Fatal().Err(err).Msg("start")
	}
	log.Info().Msg("go2rtc-updater service installed and started")
}
