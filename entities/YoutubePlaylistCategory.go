package entities

import "time"

const YoutubeCategorySystemKeyFavorite = "favorite"

type YoutubePlaylistCategory struct {
	ID        int
	UserID    string  `gorm:"index:idx_yt_cat_user;uniqueIndex:idx_yt_cat_user_system_key;not null"`
	Name      string  `gorm:"not null;size:120"`
	Position  int     `gorm:"index"`
	IsSystem  bool    `gorm:"not null;default:false"`
	SystemKey *string `gorm:"uniqueIndex:idx_yt_cat_user_system_key;size:64"`

	CreatedAt time.Time
	UpdatedAt time.Time
}
