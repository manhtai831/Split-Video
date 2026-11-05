package entities

type YoutubePlaylistItemCategory struct {
	ItemID     int `gorm:"primaryKey;autoIncrement:false;index"`
	CategoryID int `gorm:"primaryKey;autoIncrement:false;index"`
}
