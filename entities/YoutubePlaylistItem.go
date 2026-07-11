package entities

import "time"

type YoutubePlaylistItem struct {
	ID         int
	UserID     string `gorm:"uniqueIndex:idx_yt_playlist_user_video;not null"`
	YoutubeID  string `gorm:"uniqueIndex:idx_yt_playlist_user_video;not null"`
	Title      string
	Thumbnail  string
	Duration   int
	Channel    string
	WebpageURL string
	Position   int `gorm:"index"`

	FormatsJSON string
	ProbedAt    time.Time

	CreatedAt time.Time
	UpdatedAt time.Time
}
