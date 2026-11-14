package EditorService

import (
	"os"
	"path/filepath"
	"testing"

	"app/entities"
	"app/structs"
)

func TestValidateSubtitleTrackRefs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "captions.srt")
	if err := os.WriteFile(path, []byte("1\n00:00:01,000 --> 00:00:02,000\nHello\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	track := structs.EditorSubtitleDto{
		ID:        "subtitle-1",
		Name:      "captions.srt",
		ClientKey: "ck-subtitle",
	}
	if err := validateSubtitleTrackRefs(
		[]structs.EditorSubtitleDto{track},
		[]UploadedFile{{ClientKey: "ck-subtitle", Name: "captions.srt", Path: path}},
		nil,
	); err != nil {
		t.Fatalf("unexpected error for uploaded subtitle: %v", err)
	}

	if err := validateSubtitleTrackRefs([]structs.EditorSubtitleDto{track}, nil, nil); err == nil {
		t.Fatal("expected missing subtitle upload to fail")
	}

	persistedTrack := structs.EditorSubtitleDto{ID: "subtitle-1", FileID: 7, Name: "captions.srt"}
	existingFile := entities.JobFileData{ID: 7, Name: "captions.srt", Path: path}
	if err := validateSubtitleTrackRefs(
		[]structs.EditorSubtitleDto{persistedTrack},
		nil,
		map[int]entities.JobFileData{7: existingFile},
	); err != nil {
		t.Fatalf("unexpected error for existing subtitle: %v", err)
	}

	if err := validateSubtitleTrackRefs(
		[]structs.EditorSubtitleDto{persistedTrack},
		nil,
		map[int]entities.JobFileData{8: {ID: 8, Name: "captions.srt", Path: path}},
	); err == nil {
		t.Fatal("expected subtitle from another project to fail")
	}
}

func TestRemapSubtitleFileIDs(t *testing.T) {
	extras := structs.EditorJobExtrasDto{
		Subtitles: []structs.EditorSubtitleDto{{FileID: 7, Name: "captions.vtt"}},
	}
	remapSubtitleFileIDs(&extras, map[int]int{7: 42}, "job-copy")
	if extras.Subtitles[0].FileID != 42 {
		t.Fatalf("expected fileId 42, got %d", extras.Subtitles[0].FileID)
	}
	if extras.Subtitles[0].MediaURL != "/api/jobs/job-copy/files/42/download" {
		t.Fatalf("unexpected mediaUrl: %s", extras.Subtitles[0].MediaURL)
	}
}
