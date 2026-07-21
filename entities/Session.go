package entities

import "time"

type Session struct {
	ID        string `gorm:"primaryKey;size:36"`
	UserID    string `gorm:"index;not null;size:36"`
	ExpiresAt time.Time `gorm:"index;not null"`
	CreatedAt time.Time
}
