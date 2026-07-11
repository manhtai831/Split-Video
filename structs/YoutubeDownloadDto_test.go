package structs

import "testing"

func TestValidateYoutubeURL(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr bool
	}{
		{name: "empty", raw: "", wantErr: true},
		{name: "watch", raw: "https://www.youtube.com/watch?v=Pw0slbWFnU8", wantErr: false},
		{name: "short", raw: "https://youtu.be/Pw0slbWFnU8", wantErr: false},
		{name: "music", raw: "https://music.youtube.com/watch?v=Pw0slbWFnU8", wantErr: false},
		{name: "other host", raw: "https://vimeo.com/123", wantErr: true},
		{name: "no scheme", raw: "youtube.com/watch?v=1", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidateYoutubeURL(tt.raw)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestFormatsJSONRoundTrip(t *testing.T) {
	in := []YoutubeFormatDto{{
		FormatID: "140",
		Ext:      "m4a",
		Kind:     YoutubeFormatKindAudio,
		URL:      "https://example.com/a",
	}}
	raw, err := FormatsToJSON(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := FormatsFromJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0].FormatID != "140" || out[0].Kind != YoutubeFormatKindAudio {
		t.Fatalf("unexpected round trip: %+v", out)
	}
}
