package ErrorAlertWorker

import (
	"app/common/Global"
	"app/config"
	"app/entities"
	"app/enums"
	"app/services/DiscordService"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

const (
	defaultCronExpr = "0 * * * *"
	lookback        = time.Hour
	maxDetailLines  = 10
	detailLineLen   = 120
	embedColorRed   = 0xDC2626
)

func Start() {
	if strings.TrimSpace(config.DiscordWebhookURL) == "" {
		fmt.Println("[ErrorAlertWorker] DISCORD_WEBHOOK_URL empty; alerts disabled")
		return
	}

	cronExpr := strings.TrimSpace(os.Getenv("ERROR_ALERT_CRON"))
	if cronExpr == "" {
		cronExpr = defaultCronExpr
	}

	c := cron.New()
	_, err := c.AddFunc(cronExpr, runAlert)
	if err != nil {
		fmt.Printf("[ErrorAlertWorker] invalid cron %q: %v\n", cronExpr, err)
		return
	}
	c.Start()
	fmt.Printf("[ErrorAlertWorker] scheduled %q\n", cronExpr)
}

func runAlert() {
	since := time.Now().Add(-lookback)

	jobs, err := listFailedJobsSince(since)
	if err != nil {
		fmt.Printf("[ErrorAlertWorker] query failed jobs: %v\n", err)
		return
	}
	ytErrors, err := listYoutubeErrorsSince(since)
	if err != nil {
		fmt.Printf("[ErrorAlertWorker] query youtube errors: %v\n", err)
		return
	}

	if len(jobs) == 0 && len(ytErrors) == 0 {
		return
	}

	if len(jobs) > 0 {
		if err := sendJobAlert(jobs, since); err != nil {
			fmt.Printf("[ErrorAlertWorker] send job alert: %v\n", err)
		}
	}
	if len(ytErrors) > 0 {
		if err := sendYoutubeAlert(ytErrors, since); err != nil {
			fmt.Printf("[ErrorAlertWorker] send youtube alert: %v\n", err)
		}
	}
}

func listFailedJobsSince(since time.Time) ([]entities.Job, error) {
	var jobs []entities.Job
	err := Global.DB.
		Where("status = ? AND updated_at >= ?", enums.StatusFailed, since).
		Order("updated_at DESC").
		Find(&jobs).Error
	return jobs, err
}

func listYoutubeErrorsSince(since time.Time) ([]entities.YoutubePlaylistError, error) {
	var items []entities.YoutubePlaylistError
	err := Global.DB.
		Where("created_at >= ?", since).
		Order("created_at DESC").
		Find(&items).Error
	return items, err
}

func sendJobAlert(jobs []entities.Job, since time.Time) error {
	lines := make([]string, 0, maxDetailLines+1)
	limit := min(len(jobs), maxDetailLines)
	for i := 0; i < limit; i++ {
		j := jobs[i]
		msg := DiscordService.Truncate(j.Error, detailLineLen)
		if msg == "" {
			msg = "(no message)"
		}
		lines = append(lines, fmt.Sprintf("#%d [%s] %s", j.ID, j.Type, msg))
	}
	if remaining := len(jobs) - limit; remaining > 0 {
		lines = append(lines, fmt.Sprintf("… và %d lỗi khác", remaining))
	}

	embed := DiscordService.Embed{
		Title:       fmt.Sprintf("Jobs failed — %d trong 1 giờ qua", len(jobs)),
		Description: "```\n" + strings.Join(lines, "\n") + "\n```",
		Color:       embedColorRed,
		Footer:      &DiscordService.EmbedFooter{Text: footerText()},
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Fields: []DiscordService.EmbedField{
			{Name: "Since", Value: since.Format("2006-01-02 15:04:05"), Inline: true},
			{Name: "Count", Value: fmt.Sprintf("%d", len(jobs)), Inline: true},
		},
	}
	return DiscordService.SendWebhook("", []DiscordService.Embed{embed})
}

func sendYoutubeAlert(items []entities.YoutubePlaylistError, since time.Time) error {
	lines := make([]string, 0, maxDetailLines+1)
	limit := min(len(items), maxDetailLines)
	for i := 0; i < limit; i++ {
		e := items[i]
		msg := DiscordService.Truncate(e.Message, detailLineLen)
		if msg == "" {
			msg = "(no message)"
		}
		action := e.Action
		if action == "" {
			action = "unknown"
		}
		lines = append(lines, fmt.Sprintf("#%d [%s] %s", e.ID, action, msg))
	}
	if remaining := len(items) - limit; remaining > 0 {
		lines = append(lines, fmt.Sprintf("… và %d lỗi khác", remaining))
	}

	embed := DiscordService.Embed{
		Title:       fmt.Sprintf("YouTube playlist errors — %d trong 1 giờ qua", len(items)),
		Description: "```\n" + strings.Join(lines, "\n") + "\n```",
		Color:       embedColorRed,
		Footer:      &DiscordService.EmbedFooter{Text: footerText()},
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
		Fields: []DiscordService.EmbedField{
			{Name: "Since", Value: since.Format("2006-01-02 15:04:05"), Inline: true},
			{Name: "Count", Value: fmt.Sprintf("%d", len(items)), Inline: true},
		},
	}
	return DiscordService.SendWebhook("", []DiscordService.Embed{embed})
}

func footerText() string {
	if config.SiteURL != "" {
		return config.SiteURL
	}
	return "Video Tools"
}
