package JobFileDataService

import (
	"app/common/Global"
	"app/entities"
	"app/enums"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) func() {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&entities.Job{}, &entities.JobFileData{}); err != nil {
		t.Fatal(err)
	}

	prev := Global.DB
	Global.DB = db
	return func() {
		Global.DB = prev
	}
}

func seedJobWithOutputFiles(t *testing.T, db *gorm.DB, identifier, userID string) (entities.Job, []entities.JobFileData) {
	t.Helper()

	job := entities.Job{
		Identifier: identifier,
		UserID:     userID,
		Type:       enums.JobTypeSplit,
		Status:     enums.StatusCompleted,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatal(err)
	}

	otherJob := entities.Job{
		Identifier: "other-job",
		UserID:     userID,
		Type:       enums.JobTypeSplit,
		Status:     enums.StatusCompleted,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	if err := db.Create(&otherJob).Error; err != nil {
		t.Fatal(err)
	}

	outputFiles := []entities.JobFileData{
		{JobID: job.ID, Name: "part-1.mp4", Path: "/tmp/part-1.mp4", Type: enums.JobFileDataTypeOutput},
		{JobID: job.ID, Name: "part-2.mp4", Path: "/tmp/part-2.mp4", Type: enums.JobFileDataTypeOutput},
		{JobID: otherJob.ID, Name: "other.mp4", Path: "/tmp/other.mp4", Type: enums.JobFileDataTypeOutput},
	}
	for i := range outputFiles {
		if err := db.Create(&outputFiles[i]).Error; err != nil {
			t.Fatal(err)
		}
	}

	return job, outputFiles[:2]
}

func TestGetOutputFileByIdentifierAndUser(t *testing.T) {
	teardown := setupTestDB(t)
	defer teardown()

	_, files := seedJobWithOutputFiles(t, Global.DB, "job-abc", "user-1")

	got, err := GetOutputFileByIdentifierAndUser("job-abc", "user-1", files[0].ID)
	if err != nil {
		t.Fatalf("expected file, got error: %v", err)
	}
	if got.ID != files[0].ID {
		t.Fatalf("got file id %d, want %d", got.ID, files[0].ID)
	}

	if _, err := GetOutputFileByIdentifierAndUser("job-abc", "user-2", files[0].ID); err == nil {
		t.Fatal("expected error for wrong user")
	}

	if _, err := GetOutputFileByIdentifierAndUser("wrong-id", "user-1", files[0].ID); err == nil {
		t.Fatal("expected error for wrong identifier")
	}
}

func TestGetOutputFilesByIdentifierAndUser(t *testing.T) {
	teardown := setupTestDB(t)
	defer teardown()

	_, files := seedJobWithOutputFiles(t, Global.DB, "job-abc", "user-1")

	got, err := GetOutputFilesByIdentifierAndUser("job-abc", "user-1", []int{files[1].ID, files[0].ID})
	if err != nil {
		t.Fatalf("expected files, got error: %v", err)
	}
	if len(got) != 2 || got[0].ID != files[1].ID || got[1].ID != files[0].ID {
		t.Fatalf("unexpected order or count: %+v", got)
	}

	if _, err := GetOutputFilesByIdentifierAndUser("job-abc", "user-1", []int{files[0].ID, 99999}); err == nil {
		t.Fatal("expected error for unknown file id")
	}
}
