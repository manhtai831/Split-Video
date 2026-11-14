package FfmpegService

import (
	"strings"
	"testing"
)

func TestValidateSubtitleData(t *testing.T) {
	tests := []struct {
		name string
		ext  string
		data string
	}{
		{
			name: "SRT with multiline cue text",
			ext:  ".srt",
			data: "1\r\n00:00:01,000 --> 00:00:02,500\r\nFirst line\r\nSecond line\r\n\r\n",
		},
		{
			name: "VTT with short timestamps and cue settings",
			ext:  ".vtt",
			data: "WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nCaption text\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateSubtitleData(tt.ext, []byte(tt.data)); err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
		})
	}
}

func TestValidateSubtitleDataRejectsInvalidCues(t *testing.T) {
	tests := []struct {
		name string
		ext  string
		data string
		want string
	}{
		{
			name: "missing VTT header",
			ext:  ".vtt",
			data: "00:01.000 --> 00:02.000\nText\n",
			want: "WEBVTT header",
		},
		{
			name: "invalid timestamp",
			ext:  ".srt",
			data: "00:01.000 --> 00:02.000\nText\n",
			want: "timestamp",
		},
		{
			name: "end before start",
			ext:  ".srt",
			data: "00:00:02,000 --> 00:00:01,000\nText\n",
			want: "after start time",
		},
		{
			name: "missing cue text",
			ext:  ".vtt",
			data: "WEBVTT\n\n00:01.000 --> 00:02.000\n\n",
			want: "text is required",
		},
		{
			name: "no cue",
			ext:  ".srt",
			data: "This is not a subtitle",
			want: "no valid cues",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSubtitleData(tt.ext, []byte(tt.data))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("expected error containing %q, got %v", tt.want, err)
			}
		})
	}
}
