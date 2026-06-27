package entities

import (
	"app/enums"
	"time"
)

type Job struct {
	ID        int
	Type      enums.JobType
	CreatedAt time.Time
	UpdatedAt time.Time
	Status    enums.Status
	Error     string
	Result    string
}
