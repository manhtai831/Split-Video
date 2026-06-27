package Global

import (
	"app/entities"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Bootstrap() {
	db, err := gorm.Open(sqlite.Open("database/app.db"), &gorm.Config{})
	if err != nil {
		panic(err)
	}
	db.AutoMigrate(
		&entities.Job{},
	)
	DB = db
}
