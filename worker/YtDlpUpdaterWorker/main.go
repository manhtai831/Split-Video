package YtDlpUpdaterWorker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"time"

	"github.com/robfig/cron/v3"
)

const (
	defaultUpdaterBin = "/usr/local/bin/ytdlp-updater"
	defaultCronExpr   = "0 4 * * *"
	runTimeout        = 2 * time.Minute
)

func Start() {
	updaterPath := os.Getenv("YTDLP_UPDATER_BIN")
	if updaterPath == "" {
		updaterPath = defaultUpdaterBin
	}
	cronExpr := os.Getenv("YTDLP_UPDATE_CRON")
	if cronExpr == "" {
		cronExpr = defaultCronExpr
	}

	c := cron.New()
	_, err := c.AddFunc(cronExpr, func() {
		runUpdater(updaterPath)
	})
	if err != nil {
		fmt.Printf("[YtDlpUpdaterWorker] invalid cron %q: %v\n", cronExpr, err)
		return
	}
	c.Start()
	fmt.Printf("[YtDlpUpdaterWorker] scheduled %q -> %s\n", cronExpr, updaterPath)
}

func runUpdater(updaterPath string) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, updaterPath)
	out, err := cmd.CombinedOutput()
	if len(out) > 0 {
		fmt.Print(string(out))
	}
	if ctx.Err() == context.DeadlineExceeded {
		fmt.Printf("[YtDlpUpdaterWorker] timeout after %s\n", runTimeout)
		return
	}
	if err != nil {
		fmt.Printf("[YtDlpUpdaterWorker] run failed: %v\n", err)
	}
}
