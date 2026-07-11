package YtDlpUpdaterWorker

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

const (
	defaultUpdaterBin = "/usr/local/bin/ytdlp-updater"
	defaultCronExpr   = "0 4 * * *"
	defaultLogPath    = "/app/logs/yt_dlp.log"
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
		logErrorf("[YtDlpUpdaterWorker] invalid cron %q: %v\n", cronExpr, err)
		return
	}
	c.Start()
	logInfof("[YtDlpUpdaterWorker] scheduled %q -> %s\n", cronExpr, updaterPath)
}

func runUpdater(updaterPath string) {
	ctx, cancel := context.WithTimeout(context.Background(), runTimeout)
	defer cancel()

	logInfof("[YtDlpUpdaterWorker] starting %s\n", updaterPath)

	cmd := exec.CommandContext(ctx, updaterPath)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		if len(out) > 0 {
			logError(string(out))
		}
		logErrorf("[YtDlpUpdaterWorker] timeout after %s\n", runTimeout)
		return
	}
	if err != nil {
		if len(out) > 0 {
			logError(string(out))
		}
		logErrorf("[YtDlpUpdaterWorker] run failed: %v\n", err)
		return
	}
	if len(out) > 0 {
		logInfo(string(out))
	}
	logInfof("[YtDlpUpdaterWorker] finished successfully\n")
}

func logPath() string {
	if p := os.Getenv("YTDLP_UPDATE_LOG"); p != "" {
		return p
	}
	return defaultLogPath
}

func logInfof(format string, args ...any) {
	logInfo(fmt.Sprintf(format, args...))
}

func logErrorf(format string, args ...any) {
	logError(fmt.Sprintf(format, args...))
}

func logInfo(msg string) {
	logPrint("Info", msg)
}

func logError(msg string) {
	logPrint("Error", msg)
}

func formatLog(level, msg string) string {
	ts := time.Now().Format("2006-01-02 15:04:05")
	lines := strings.Split(strings.TrimRight(msg, "\n"), "\n")
	for i, line := range lines {
		lines[i] = fmt.Sprintf("[%s] [%s] %s", ts, level, line)
	}
	return strings.Join(lines, "\n") + "\n"
}

func logPrint(level, msg string) {
	msg = formatLog(level, msg)
	fmt.Print(msg)
	path := logPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fmt.Printf("[YtDlpUpdaterWorker] create log dir failed: %v\n", err)
		return
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Printf("[YtDlpUpdaterWorker] open log file failed: %v\n", err)
		return
	}
	defer f.Close()
	if _, err := f.WriteString(msg); err != nil {
		fmt.Printf("[YtDlpUpdaterWorker] write log failed: %v\n", err)
	}
}
