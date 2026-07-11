package YtDlpService

import (
	"app/structs"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

const probeTimeout = 90 * time.Second

type rawFormat struct {
	FormatID       string   `json:"format_id"`
	Ext            string   `json:"ext"`
	Resolution     string   `json:"resolution"`
	FPS            *float64 `json:"fps"`
	Abr            *float64 `json:"abr"`
	Tbr            *float64 `json:"tbr"`
	VCodec         string   `json:"vcodec"`
	ACodec         string   `json:"acodec"`
	Filesize       *int64   `json:"filesize"`
	FilesizeApprox *int64   `json:"filesize_approx"`
	FormatNote     string   `json:"format_note"`
	URL            string   `json:"url"`
	Protocol       string   `json:"protocol"`
}

type rawProbe struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Thumbnail  string      `json:"thumbnail"`
	Duration   float64     `json:"duration"`
	Channel    string      `json:"channel"`
	WebpageURL string      `json:"webpage_url"`
	OriginalURL string     `json:"original_url"`
	Formats    []rawFormat `json:"formats"`
}

func Probe(ctx context.Context, pageURL string) (structs.YoutubeProbeDto, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "yt-dlp",
		"-j",
		"--no-check-certificate",
		"--no-playlist",
		pageURL,
	)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return structs.YoutubeProbeDto{}, fmt.Errorf("không lấy được thông tin video: %s", msg)
	}

	var raw rawProbe
	if err := json.Unmarshal(stdout.Bytes(), &raw); err != nil {
		return structs.YoutubeProbeDto{}, fmt.Errorf("không đọc được JSON từ yt-dlp: %w", err)
	}

	webpageURL := raw.WebpageURL
	if webpageURL == "" {
		webpageURL = raw.OriginalURL
	}
	if webpageURL == "" {
		webpageURL = pageURL
	}

	dto := structs.YoutubeProbeDto{
		ID:         raw.ID,
		Title:      raw.Title,
		Thumbnail:  raw.Thumbnail,
		Duration:   int(raw.Duration),
		Channel:    raw.Channel,
		WebpageURL: webpageURL,
		Formats:    mapFormats(raw.Formats),
	}
	if dto.ID == "" {
		return structs.YoutubeProbeDto{}, fmt.Errorf("yt-dlp không trả về video id")
	}
	return dto, nil
}

func mapFormats(raw []rawFormat) []structs.YoutubeFormatDto {
	out := make([]structs.YoutubeFormatDto, 0, len(raw))
	for _, f := range raw {
		if shouldSkipFormat(f) {
			continue
		}
		filesize := int64(0)
		if f.Filesize != nil && *f.Filesize > 0 {
			filesize = *f.Filesize
		} else if f.FilesizeApprox != nil && *f.FilesizeApprox > 0 {
			filesize = *f.FilesizeApprox
		}
		fps := 0.0
		if f.FPS != nil {
			fps = *f.FPS
		}
		out = append(out, structs.YoutubeFormatDto{
			FormatID:   f.FormatID,
			Ext:        f.Ext,
			Resolution: f.Resolution,
			FPS:        fps,
			Abr:        pickBitrate(f.Abr, f.Tbr),
			VCodec:     normalizeCodec(f.VCodec),
			ACodec:     normalizeCodec(f.ACodec),
			Filesize:   filesize,
			FormatNote: f.FormatNote,
			URL:        f.URL,
			Kind:       classifyKind(f.VCodec, f.ACodec),
		})
	}
	return out
}

func pickBitrate(abr, tbr *float64) float64 {
	if abr != nil && *abr > 0 {
		return *abr
	}
	if tbr != nil && *tbr > 0 {
		return *tbr
	}
	return 0
}

func shouldSkipFormat(f rawFormat) bool {
	note := strings.ToLower(f.FormatNote)
	ext := strings.ToLower(f.Ext)
	protocol := strings.ToLower(f.Protocol)
	if strings.Contains(note, "storyboard") {
		return true
	}
	if ext == "mhtml" || protocol == "mhtml" {
		return true
	}
	if strings.TrimSpace(f.URL) == "" {
		return true
	}
	if strings.TrimSpace(f.FormatID) == "" {
		return true
	}
	return false
}

func normalizeCodec(v string) string {
	v = strings.TrimSpace(v)
	if v == "" || strings.EqualFold(v, "none") {
		return "none"
	}
	return v
}

func classifyKind(vcodec, acodec string) structs.YoutubeFormatKind {
	hasVideo := hasCodec(vcodec)
	hasAudio := hasCodec(acodec)
	switch {
	case hasVideo && hasAudio:
		return structs.YoutubeFormatKindMuxed
	case hasAudio && !hasVideo:
		return structs.YoutubeFormatKindAudio
	default:
		return structs.YoutubeFormatKindVideo
	}
}

func hasCodec(v string) bool {
	v = strings.TrimSpace(v)
	return v != "" && !strings.EqualFold(v, "none")
}
