package YtDlpService

import (
	"app/structs"
	"testing"
)

func TestClassifyKind(t *testing.T) {
	tests := []struct {
		vcodec string
		acodec string
		want   structs.YoutubeFormatKind
	}{
		{"none", "mp4a.40.2", structs.YoutubeFormatKindAudio},
		{"avc1", "none", structs.YoutubeFormatKindVideo},
		{"avc1", "mp4a.40.2", structs.YoutubeFormatKindMuxed},
		{"", "", structs.YoutubeFormatKindVideo},
	}
	for _, tt := range tests {
		got := classifyKind(tt.vcodec, tt.acodec)
		if got != tt.want {
			t.Fatalf("classifyKind(%q,%q)=%q want %q", tt.vcodec, tt.acodec, got, tt.want)
		}
	}
}

func TestShouldSkipFormat(t *testing.T) {
	if !shouldSkipFormat(rawFormat{FormatNote: "storyboard", FormatID: "sb0", URL: "http://x", Ext: "mhtml"}) {
		t.Fatal("expected storyboard skip")
	}
	if shouldSkipFormat(rawFormat{FormatID: "140", URL: "http://x", Ext: "m4a", ACodec: "mp4a"}) {
		t.Fatal("should not skip audio")
	}
	if !shouldSkipFormat(rawFormat{FormatID: "1", Ext: "mp4"}) {
		t.Fatal("expected empty url skip")
	}
}

func TestMapFormatsFiltersStoryboard(t *testing.T) {
	abr := 129.472
	raw := []rawFormat{
		{FormatID: "sb0", FormatNote: "storyboard", Ext: "mhtml", Protocol: "mhtml", URL: "http://sb"},
		{FormatID: "140", Ext: "m4a", VCodec: "none", ACodec: "mp4a.40.2", URL: "http://a", Resolution: "audio only", Abr: &abr},
	}
	out := mapFormats(raw)
	if len(out) != 1 || out[0].FormatID != "140" || out[0].Kind != structs.YoutubeFormatKindAudio {
		t.Fatalf("unexpected formats: %+v", out)
	}
	if out[0].Abr < 129 || out[0].Abr > 130 {
		t.Fatalf("expected abr ~129.5, got %v", out[0].Abr)
	}
}

func TestPickBitrate(t *testing.T) {
	abr := 128.0
	tbr := 200.0
	zero := 0.0
	if got := pickBitrate(&abr, &tbr); got != 128 {
		t.Fatalf("prefer abr: got %v", got)
	}
	if got := pickBitrate(&zero, &tbr); got != 200 {
		t.Fatalf("fallback tbr: got %v", got)
	}
	if got := pickBitrate(nil, nil); got != 0 {
		t.Fatalf("empty: got %v", got)
	}
}
