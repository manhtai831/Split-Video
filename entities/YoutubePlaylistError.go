package entities

import "time"

type YoutubePlaylistError struct {
	ID        int
	UserID    string `gorm:"index;not null"`
	URL       string
	Action    string `gorm:"index"`
	Message   string
	CreatedAt time.Time
	UpdatedAt time.Time
}
