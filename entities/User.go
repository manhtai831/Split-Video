package entities

import "time"

type User struct {
	ID           string `gorm:"primaryKey;size:36"`
	Email        string `gorm:"uniqueIndex;not null;size:255"`
	PasswordHash string `gorm:"not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
