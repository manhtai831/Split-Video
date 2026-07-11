package structs

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

type YoutubeFormatKind string

const (
	YoutubeFormatKindAudio YoutubeFormatKind = "audio"
	YoutubeFormatKindVideo YoutubeFormatKind = "video"
	YoutubeFormatKindMuxed YoutubeFormatKind = "muxed"
)

type YoutubeFormatDto struct {
	FormatID    string            `json:"format_id"`
	AvailableAt int64             `json:"available_at"`
	Ext         string            `json:"ext"`
	Resolution  string            `json:"resolution"`
	FPS         float64           `json:"fps,omitempty"`
	Abr         float64           `json:"abr,omitempty"`
	VCodec      string            `json:"vcodec"`
	ACodec      string            `json:"acodec"`
	Filesize    int64             `json:"filesize,omitempty"`
	FormatNote  string            `json:"format_note"`
	URL         string            `json:"url"`
	Kind        YoutubeFormatKind `json:"kind"`
}

type YoutubeProbeDto struct {
	ID         string             `json:"id"`
	Title      string             `json:"title"`
	Thumbnail  string             `json:"thumbnail"`
	Duration   int                `json:"duration"`
	Channel    string             `json:"channel"`
	WebpageURL string             `json:"webpage_url"`
	Formats    []YoutubeFormatDto `json:"formats"`
}

type YoutubePlaylistItemDto struct {
	ID         int       `json:"id"`
	YoutubeID  string    `json:"youtube_id"`
	Title      string    `json:"title"`
	Thumbnail  string    `json:"thumbnail"`
	Duration   int       `json:"duration"`
	Channel    string    `json:"channel"`
	WebpageURL string    `json:"webpage_url"`
	Position   int       `json:"position"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type YoutubePlaylistAddRequestDto struct {
	URL string `json:"url"`
}

type YoutubePlaylistAddResponseDto struct {
	Item    YoutubePlaylistItemDto `json:"item"`
	Formats []YoutubeFormatDto     `json:"formats"`
}

type YoutubePlaylistListResponseDto struct {
	Items []YoutubePlaylistItemDto `json:"items"`
}

type YoutubeFormatsResponseDto struct {
	Item    YoutubePlaylistItemDto `json:"item"`
	Formats []YoutubeFormatDto     `json:"formats"`
}

type YoutubeResolveResponseDto struct {
	URL         string            `json:"url"`
	Ext         string            `json:"ext"`
	Kind        YoutubeFormatKind `json:"kind"`
	AvailableAt int64             `json:"available_at"`
}

type YoutubeReorderRequestDto struct {
	Position int `json:"position"`
}

func ValidateYoutubeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("cần nhập URL YouTube")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("URL không hợp lệ")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("URL phải dùng http hoặc https")
	}
	host := strings.ToLower(parsed.Hostname())
	if !isYoutubeHost(host) {
		return "", fmt.Errorf("chỉ hỗ trợ URL YouTube (youtube.com / youtu.be)")
	}
	return raw, nil
}

func isYoutubeHost(host string) bool {
	switch host {
	case "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be":
		return true
	default:
		return strings.HasSuffix(host, ".youtube.com")
	}
}

func FormatsToJSON(formats []YoutubeFormatDto) (string, error) {
	b, err := json.Marshal(formats)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func FormatsFromJSON(raw string) ([]YoutubeFormatDto, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	var formats []YoutubeFormatDto
	if err := json.Unmarshal([]byte(raw), &formats); err != nil {
		return nil, err
	}
	return formats, nil
}
