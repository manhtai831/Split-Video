package DiscordService

import (
	"app/config"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxContentLen     = 2000
	maxEmbedDescLen   = 4096
	maxFieldValueLen  = 1024
	maxEmbedTitleLen  = 256
	webhookTimeout    = 10 * time.Second
)

type EmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type EmbedFooter struct {
	Text string `json:"text,omitempty"`
}

type Embed struct {
	Title       string       `json:"title,omitempty"`
	Description string       `json:"description,omitempty"`
	Color       int          `json:"color,omitempty"`
	Fields      []EmbedField `json:"fields,omitempty"`
	Footer      *EmbedFooter `json:"footer,omitempty"`
	Timestamp   string       `json:"timestamp,omitempty"`
}

type webhookPayload struct {
	Content string  `json:"content,omitempty"`
	Embeds  []Embed `json:"embeds,omitempty"`
}

// SendWebhook posts a Discord incoming-webhook payload.
// If DISCORD_WEBHOOK_URL is empty, it is a no-op.
func SendWebhook(content string, embeds []Embed) error {
	url := strings.TrimSpace(config.DiscordWebhookURL)
	if url == "" {
		return nil
	}

	payload := webhookPayload{
		Content: Truncate(content, maxContentLen),
		Embeds:  sanitizeEmbeds(embeds),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal webhook payload: %w", err)
	}

	client := &http.Client{Timeout: webhookTimeout}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("webhook status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return nil
}

func sanitizeEmbeds(embeds []Embed) []Embed {
	if len(embeds) == 0 {
		return nil
	}
	out := make([]Embed, len(embeds))
	for i, e := range embeds {
		e.Title = Truncate(e.Title, maxEmbedTitleLen)
		e.Description = Truncate(e.Description, maxEmbedDescLen)
		if e.Footer != nil {
			e.Footer.Text = Truncate(e.Footer.Text, maxEmbedTitleLen)
		}
		for j := range e.Fields {
			e.Fields[j].Name = Truncate(e.Fields[j].Name, maxEmbedTitleLen)
			e.Fields[j].Value = Truncate(e.Fields[j].Value, maxFieldValueLen)
		}
		out[i] = e
	}
	return out
}

// Truncate shortens s to at most max runes, appending "…" when clipped.
func Truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	if max == 1 {
		return "…"
	}
	return string(runes[:max-1]) + "…"
}
