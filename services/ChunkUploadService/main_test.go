package ChunkUploadService

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMergeParts(t *testing.T) {
	dir := t.TempDir()
	folder := filepath.Join(dir, "slot0")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}

	part1 := filepath.Join(folder, "file.part.1")
	part2 := filepath.Join(folder, "file.part.2")
	if err := os.WriteFile(part1, []byte("hello "), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(part2, []byte("world"), 0o644); err != nil {
		t.Fatal(err)
	}

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	uploadsDir := filepath.Join(cwd, "uploads_test_merge")
	if err := os.MkdirAll(uploadsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(uploadsDir)

	origWD, _ := os.Getwd()
	if err := os.Chdir(cwd); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(origWD)

	if err := os.MkdirAll("uploads", 0o755); err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll("uploads")

	outPath, size, err := mergeParts(folder, "test.txt", 2)
	if err != nil {
		t.Fatalf("mergeParts: %v", err)
	}
	if size != 11 {
		t.Fatalf("expected size 11, got %d", size)
	}
	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Fatalf("unexpected content: %q", string(data))
	}
}

func TestValidateChunkFolder(t *testing.T) {
	_, _, _, err := loadManifestForFolder("user1", "uploads/evil/../../etc")
	if err != ErrInvalidFolder {
		t.Fatalf("expected ErrInvalidFolder, got %v", err)
	}
}
