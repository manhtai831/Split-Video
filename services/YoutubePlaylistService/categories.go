package YoutubePlaylistService

import (
	"app/common/Global"
	"app/entities"
	"app/structs"
	"errors"
	"strings"

	"gorm.io/gorm"
)

var (
	ErrCategorySystemProtected = errors.New("không thể sửa hoặc xóa category hệ thống")
	ErrCategoryNameRequired    = errors.New("cần nhập tên category")
	ErrCategoryNotFound        = gorm.ErrRecordNotFound
)

func favoriteSystemKeyPtr() *string {
	k := entities.YoutubeCategorySystemKeyFavorite
	return &k
}

func EnsureFavoriteCategory(userID string) (entities.YoutubePlaylistCategory, error) {
	var cat entities.YoutubePlaylistCategory
	err := Global.DB.
		Where("user_id = ? AND system_key = ?", userID, entities.YoutubeCategorySystemKeyFavorite).
		First(&cat).Error
	if err == nil {
		return cat, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return entities.YoutubePlaylistCategory{}, err
	}

	cat = entities.YoutubePlaylistCategory{
		UserID:    userID,
		Name:      "Favorite",
		Position:  0,
		IsSystem:  true,
		SystemKey: favoriteSystemKeyPtr(),
	}
	if err := Global.DB.Create(&cat).Error; err != nil {
		// Race: another request created it
		var existing entities.YoutubePlaylistCategory
		if findErr := Global.DB.
			Where("user_id = ? AND system_key = ?", userID, entities.YoutubeCategorySystemKeyFavorite).
			First(&existing).Error; findErr == nil {
			return existing, nil
		}
		return entities.YoutubePlaylistCategory{}, err
	}
	return cat, nil
}

func ListCategories(userID string) ([]entities.YoutubePlaylistCategory, error) {
	if _, err := EnsureFavoriteCategory(userID); err != nil {
		return nil, err
	}
	var cats []entities.YoutubePlaylistCategory
	err := Global.DB.
		Where("user_id = ?", userID).
		Order("position asc, id asc").
		Find(&cats).Error
	if err != nil {
		return nil, err
	}
	// Pin Favorite first for stable UI tab order.
	favIdx := -1
	for i := range cats {
		if cats[i].SystemKey != nil && *cats[i].SystemKey == entities.YoutubeCategorySystemKeyFavorite {
			favIdx = i
			break
		}
	}
	if favIdx > 0 {
		fav := cats[favIdx]
		rest := append([]entities.YoutubePlaylistCategory{}, cats[:favIdx]...)
		rest = append(rest, cats[favIdx+1:]...)
		cats = append([]entities.YoutubePlaylistCategory{fav}, rest...)
	}
	return cats, nil
}

func GetCategoryForUser(id int, userID string) (entities.YoutubePlaylistCategory, error) {
	var cat entities.YoutubePlaylistCategory
	err := Global.DB.Where("id = ? AND user_id = ?", id, userID).First(&cat).Error
	return cat, err
}

func CreateCategory(userID, name string) (entities.YoutubePlaylistCategory, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return entities.YoutubePlaylistCategory{}, ErrCategoryNameRequired
	}
	if len(name) > 120 {
		name = name[:120]
	}
	if _, err := EnsureFavoriteCategory(userID); err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	pos, err := nextCategoryPosition(userID)
	if err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	cat := entities.YoutubePlaylistCategory{
		UserID:   userID,
		Name:     name,
		Position: pos,
		IsSystem: false,
	}
	if err := Global.DB.Create(&cat).Error; err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	return cat, nil
}

func RenameCategory(id int, userID, name string) (entities.YoutubePlaylistCategory, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return entities.YoutubePlaylistCategory{}, ErrCategoryNameRequired
	}
	if len(name) > 120 {
		name = name[:120]
	}
	cat, err := GetCategoryForUser(id, userID)
	if err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	if cat.IsSystem {
		return entities.YoutubePlaylistCategory{}, ErrCategorySystemProtected
	}
	cat.Name = name
	if err := Global.DB.Save(&cat).Error; err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	return cat, nil
}

func DeleteCategory(id int, userID string) error {
	cat, err := GetCategoryForUser(id, userID)
	if err != nil {
		return err
	}
	if cat.IsSystem {
		return ErrCategorySystemProtected
	}
	return Global.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("category_id = ?", cat.ID).Delete(&entities.YoutubePlaylistItemCategory{}).Error; err != nil {
			return err
		}
		result := tx.Where("id = ? AND user_id = ?", cat.ID, userID).Delete(&entities.YoutubePlaylistCategory{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func UpdateCategoryPosition(id int, userID string, position int) (entities.YoutubePlaylistCategory, error) {
	cats, err := ListCategories(userID)
	if err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}

	fromIdx := -1
	for i := range cats {
		if cats[i].ID == id {
			fromIdx = i
			break
		}
	}
	if fromIdx < 0 {
		return entities.YoutubePlaylistCategory{}, gorm.ErrRecordNotFound
	}
	if cats[fromIdx].IsSystem {
		return entities.YoutubePlaylistCategory{}, ErrCategorySystemProtected
	}

	n := len(cats)
	if position < 0 {
		position = 0
	}
	if position >= n {
		position = n - 1
	}
	if fromIdx == position {
		return cats[fromIdx], nil
	}

	moved := cats[fromIdx]
	rest := append([]entities.YoutubePlaylistCategory{}, cats[:fromIdx]...)
	rest = append(rest, cats[fromIdx+1:]...)
	ordered := append([]entities.YoutubePlaylistCategory{}, rest[:position]...)
	ordered = append(ordered, moved)
	ordered = append(ordered, rest[position:]...)

	err = Global.DB.Transaction(func(tx *gorm.DB) error {
		for i := range ordered {
			if ordered[i].Position == i {
				continue
			}
			if err := tx.Model(&entities.YoutubePlaylistCategory{}).
				Where("id = ? AND user_id = ?", ordered[i].ID, userID).
				Update("position", i).Error; err != nil {
				return err
			}
			ordered[i].Position = i
		}
		return nil
	})
	if err != nil {
		return entities.YoutubePlaylistCategory{}, err
	}
	return ordered[position], nil
}

func ListByCategory(userID string, categoryID int) ([]entities.YoutubePlaylistItem, error) {
	cat, err := GetCategoryForUser(categoryID, userID)
	if err != nil {
		return nil, err
	}
	var items []entities.YoutubePlaylistItem
	err = Global.DB.
		Table("youtube_playlist_items AS i").
		Joins("INNER JOIN youtube_playlist_item_categories AS ic ON ic.item_id = i.id").
		Where("i.user_id = ? AND ic.category_id = ?", userID, cat.ID).
		Order("i.position asc, i.id asc").
		Find(&items).Error
	return items, err
}

func linkItemToCategory(itemID, categoryID int) error {
	var existing entities.YoutubePlaylistItemCategory
	err := Global.DB.Where("item_id = ? AND category_id = ?", itemID, categoryID).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return Global.DB.Create(&entities.YoutubePlaylistItemCategory{
		ItemID:     itemID,
		CategoryID: categoryID,
	}).Error
}

func unlinkItemFromCategory(itemID, categoryID int) error {
	return Global.DB.
		Where("item_id = ? AND category_id = ?", itemID, categoryID).
		Delete(&entities.YoutubePlaylistItemCategory{}).Error
}

// LinkItemToUserCategory links item to a non-system category owned by user.
func LinkItemToUserCategory(userID string, itemID, categoryID int) error {
	cat, err := GetCategoryForUser(categoryID, userID)
	if err != nil {
		return err
	}
	if cat.IsSystem {
		return ErrCategorySystemProtected
	}
	item, err := GetByIDForUser(itemID, userID)
	if err != nil {
		return err
	}
	return linkItemToCategory(item.ID, cat.ID)
}

// UnlinkItemFromUserCategory removes item from a non-system category owned by user.
func UnlinkItemFromUserCategory(userID string, itemID, categoryID int) error {
	cat, err := GetCategoryForUser(categoryID, userID)
	if err != nil {
		return err
	}
	if cat.IsSystem {
		return ErrCategorySystemProtected
	}
	item, err := GetByIDForUser(itemID, userID)
	if err != nil {
		return err
	}
	return unlinkItemFromCategory(item.ID, cat.ID)
}

func ToggleFavorite(userID string, itemID int) (entities.YoutubePlaylistItem, bool, error) {
	item, err := GetByIDForUser(itemID, userID)
	if err != nil {
		return entities.YoutubePlaylistItem{}, false, err
	}
	fav, err := EnsureFavoriteCategory(userID)
	if err != nil {
		return entities.YoutubePlaylistItem{}, false, err
	}

	var existing entities.YoutubePlaylistItemCategory
	err = Global.DB.Where("item_id = ? AND category_id = ?", item.ID, fav.ID).First(&existing).Error
	if err == nil {
		if err := unlinkItemFromCategory(item.ID, fav.ID); err != nil {
			return entities.YoutubePlaylistItem{}, false, err
		}
		return item, false, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return entities.YoutubePlaylistItem{}, false, err
	}
	if err := linkItemToCategory(item.ID, fav.ID); err != nil {
		return entities.YoutubePlaylistItem{}, false, err
	}
	return item, true, nil
}

func favoriteItemIDSet(userID string, itemIDs []int) (map[int]bool, error) {
	out := make(map[int]bool)
	if len(itemIDs) == 0 {
		return out, nil
	}
	fav, err := EnsureFavoriteCategory(userID)
	if err != nil {
		return nil, err
	}
	var joins []entities.YoutubePlaylistItemCategory
	if err := Global.DB.
		Where("category_id = ? AND item_id IN ?", fav.ID, itemIDs).
		Find(&joins).Error; err != nil {
		return nil, err
	}
	for _, j := range joins {
		out[j.ItemID] = true
	}
	return out, nil
}

// userCategoryIDsByItem returns non-system category IDs per item.
func userCategoryIDsByItem(userID string, itemIDs []int) (map[int][]int, error) {
	out := make(map[int][]int)
	if len(itemIDs) == 0 {
		return out, nil
	}
	type row struct {
		ItemID     int
		CategoryID int
	}
	var rows []row
	err := Global.DB.
		Table("youtube_playlist_item_categories AS ic").
		Select("ic.item_id, ic.category_id").
		Joins("INNER JOIN youtube_playlist_categories AS c ON c.id = ic.category_id").
		Where("ic.item_id IN ? AND c.user_id = ? AND c.is_system = ?", itemIDs, userID, false).
		Order("ic.category_id asc").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ItemID] = append(out[r.ItemID], r.CategoryID)
	}
	return out, nil
}

func ToCategoryDto(cat entities.YoutubePlaylistCategory) structs.YoutubePlaylistCategoryDto {
	key := ""
	if cat.SystemKey != nil {
		key = *cat.SystemKey
	}
	return structs.YoutubePlaylistCategoryDto{
		ID:        cat.ID,
		Name:      cat.Name,
		Position:  cat.Position,
		IsSystem:  cat.IsSystem,
		SystemKey: key,
	}
}

func ToItemDtos(userID string, items []entities.YoutubePlaylistItem) ([]structs.YoutubePlaylistItemDto, error) {
	ids := make([]int, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	favSet, err := favoriteItemIDSet(userID, ids)
	if err != nil {
		return nil, err
	}
	catIDs, err := userCategoryIDsByItem(userID, ids)
	if err != nil {
		return nil, err
	}
	dtos := make([]structs.YoutubePlaylistItemDto, 0, len(items))
	for _, it := range items {
		dto := ToItemDto(it)
		dto.IsFavorite = favSet[it.ID]
		if ids := catIDs[it.ID]; len(ids) > 0 {
			dto.CategoryIDs = ids
		} else {
			dto.CategoryIDs = []int{}
		}
		dtos = append(dtos, dto)
	}
	return dtos, nil
}

func ToItemDtoWithFavorite(userID string, item entities.YoutubePlaylistItem) (structs.YoutubePlaylistItemDto, error) {
	dtos, err := ToItemDtos(userID, []entities.YoutubePlaylistItem{item})
	if err != nil {
		return structs.YoutubePlaylistItemDto{}, err
	}
	if len(dtos) == 0 {
		return ToItemDto(item), nil
	}
	return dtos[0], nil
}

func nextCategoryPosition(userID string) (int, error) {
	var maxPos *int
	err := Global.DB.Model(&entities.YoutubePlaylistCategory{}).
		Where("user_id = ?", userID).
		Select("MAX(position)").
		Scan(&maxPos).Error
	if err != nil {
		return 0, err
	}
	if maxPos == nil {
		return 1, nil
	}
	return *maxPos + 1, nil
}

// MigrateAnonymousCategories moves anon categories/joins onto toUserID.
// Call after playlist items have already been reassigned to toUserID.
func MigrateAnonymousCategories(fromAnonID, toUserID string) error {
	if fromAnonID == "" || toUserID == "" || fromAnonID == toUserID {
		return nil
	}
	db := Global.DB

	targetFav, err := EnsureFavoriteCategory(toUserID)
	if err != nil {
		return err
	}

	var anonFav entities.YoutubePlaylistCategory
	anonFavErr := db.
		Where("user_id = ? AND system_key = ?", fromAnonID, entities.YoutubeCategorySystemKeyFavorite).
		First(&anonFav).Error
	if anonFavErr == nil {
		if err := db.Exec(`
			INSERT OR IGNORE INTO youtube_playlist_item_categories (item_id, category_id)
			SELECT ic.item_id, ?
			FROM youtube_playlist_item_categories ic
			WHERE ic.category_id = ?
		`, targetFav.ID, anonFav.ID).Error; err != nil {
			return err
		}
		if err := db.Where("category_id = ?", anonFav.ID).Delete(&entities.YoutubePlaylistItemCategory{}).Error; err != nil {
			return err
		}
		if err := db.Delete(&anonFav).Error; err != nil {
			return err
		}
	} else if !errors.Is(anonFavErr, gorm.ErrRecordNotFound) {
		return anonFavErr
	}

	return db.Model(&entities.YoutubePlaylistCategory{}).
		Where("user_id = ?", fromAnonID).
		Update("user_id", toUserID).Error
}
