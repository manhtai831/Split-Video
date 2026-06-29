package entities

import (
	"app/enums"
	"time"
)

type Job struct {
	ID         int
	Identifier string
	Type       enums.JobType
	UserID     string
	Status     enums.Status
	Progress   float64
	Error      string

	Extras string

	StartedAt  time.Time
	FinishedAt time.Time
	DownloadAt time.Time

	CreatedAt time.Time
	UpdatedAt time.Time
}
