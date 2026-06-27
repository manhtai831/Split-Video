package entities

import (
	"app/enums"
	"time"
)

type Job struct {
	ID         int
	Identifier string
	UserID     string
	Type       enums.JobType
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Status     enums.Status
	Progress   float64
	Error      string
	Result     string
}
