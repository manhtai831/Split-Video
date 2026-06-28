package entities

import (
	"app/enums"
	"time"
)

type JobFileData struct {
	ID        int
	JobID     int
	Name      string
	Size      int64
	Duration  float64
	From      float64
	To        float64
	Path      string
	Type      enums.JobFileDataType
	CreatedAt time.Time
	UpdatedAt time.Time
}
