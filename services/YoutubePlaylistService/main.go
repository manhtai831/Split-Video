package YoutubePlaylistService

import (
	"app/common/Global"
	"app/config"
	"app/entities"
	"app/services/YtDlpService"
	"app/structs"
	"context"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

func formatsCacheTTL() time.Duration {
	mins := config.YoutubeFormatsCacheMinutes
	if mins < 1 {
		mins = 30
	}
	return time.Duration(mins) * time.Minute
}

func ListByUser(userID string) ([]entities.YoutubePlaylistItem, error) {
	var items []entities.YoutubePlaylistItem
	err := Global.DB.
		Where("user_id = ?", userID).
		Order("position asc, id asc").
		Find(&items).Error
	return items, err
}

func GetByIDForUser(id int, userID string) (entities.YoutubePlaylistItem, error) {
	var item entities.YoutubePlaylistItem
	err := Global.DB.Where("id = ? AND user_id = ?", id, userID).First(&item).Error
	return item, err
}

func AddFromURL(ctx context.Context, userID, pageURL string) (entities.YoutubePlaylistItem, []structs.YoutubeFormatDto, error) {
	validated, err := structs.ValidateYoutubeURL(pageURL)
	if err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	youtubeID := extractYoutubeID(validated)
	if youtubeID != "" {
		var existing entities.YoutubePlaylistItem
		err = Global.DB.Where("user_id = ? AND youtube_id = ?", userID, youtubeID).First(&existing).Error
		if err == nil {
			if formats, ok := cachedFormats(existing); ok {
				return existing, formats, nil
			}
			existing.WebpageURL = validated
			return refreshFormats(ctx, existing)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return entities.YoutubePlaylistItem{}, nil, err
		}
	}

	probe, err := YtDlpService.Probe(ctx, validated)
	if err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	formatsJSON, err := structs.FormatsToJSON(probe.Formats)
	if err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	now := time.Now()
	var existing entities.YoutubePlaylistItem
	err = Global.DB.Where("user_id = ? AND youtube_id = ?", userID, probe.ID).First(&existing).Error
	if err == nil {
		existing.Title = probe.Title
		existing.Thumbnail = probe.Thumbnail
		existing.Duration = probe.Duration
		existing.Channel = probe.Channel
		existing.WebpageURL = probe.WebpageURL
		existing.FormatsJSON = formatsJSON
		existing.ProbedAt = now
		if err := Global.DB.Save(&existing).Error; err != nil {
			return entities.YoutubePlaylistItem{}, nil, err
		}
		return existing, probe.Formats, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	position, err := nextPosition(userID)
	if err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	item := entities.YoutubePlaylistItem{
		UserID:      userID,
		YoutubeID:   probe.ID,
		Title:       probe.Title,
		Thumbnail:   probe.Thumbnail,
		Duration:    probe.Duration,
		Channel:     probe.Channel,
		WebpageURL:  probe.WebpageURL,
		Position:    position,
		FormatsJSON: formatsJSON,
		ProbedAt:    now,
	}
	if err := Global.DB.Create(&item).Error; err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}
	return item, probe.Formats, nil
}

func DeleteForUser(id int, userID string) error {
	result := Global.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&entities.YoutubePlaylistItem{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func UpdatePosition(id int, userID string, position int) (entities.YoutubePlaylistItem, error) {
	items, err := ListByUser(userID)
	if err != nil {
		return entities.YoutubePlaylistItem{}, err
	}

	fromIdx := -1
	for i := range items {
		if items[i].ID == id {
			fromIdx = i
			break
		}
	}
	if fromIdx < 0 {
		return entities.YoutubePlaylistItem{}, gorm.ErrRecordNotFound
	}

	n := len(items)
	if position < 0 {
		position = 0
	}
	if position >= n {
		position = n - 1
	}
	if fromIdx == position {
		return items[fromIdx], nil
	}

	moved := items[fromIdx]
	rest := append([]entities.YoutubePlaylistItem{}, items[:fromIdx]...)
	rest = append(rest, items[fromIdx+1:]...)
	ordered := append([]entities.YoutubePlaylistItem{}, rest[:position]...)
	ordered = append(ordered, moved)
	ordered = append(ordered, rest[position:]...)

	err = Global.DB.Transaction(func(tx *gorm.DB) error {
		for i := range ordered {
			if ordered[i].Position == i {
				continue
			}
			if err := tx.Model(&entities.YoutubePlaylistItem{}).
				Where("id = ? AND user_id = ?", ordered[i].ID, userID).
				Update("position", i).Error; err != nil {
				return err
			}
			ordered[i].Position = i
		}
		return nil
	})
	if err != nil {
		return entities.YoutubePlaylistItem{}, err
	}
	return ordered[position], nil
}

func GetFormats(ctx context.Context, id int, userID string) (entities.YoutubePlaylistItem, []structs.YoutubeFormatDto, error) {
	item, err := GetByIDForUser(id, userID)
	if err != nil {
		return entities.YoutubePlaylistItem{}, nil, err
	}

	if formats, ok := cachedFormats(item); ok {
		return item, formats, nil
	}

	return refreshFormats(ctx, item)
}

func ResolveFormat(ctx context.Context, id int, userID, formatID string) (structs.YoutubeResolveResponseDto, error) {
	formatID = strings.TrimSpace(formatID)
	if formatID == "" {
		return structs.YoutubeResolveResponseDto{}, fmt.Errorf("cần chọn format_id")
	}

	item, formats, err := GetFormats(ctx, id, userID)
	if err != nil {
		return structs.YoutubeResolveResponseDto{}, err
	}
	resolved, err := getItemUrl(formats, formatID)
	if err != nil {
		return structs.YoutubeResolveResponseDto{}, err
	}

	if isResolvedURLExpired(resolved.URL) {
		item, formats, err = refreshFormats(ctx, item)
		if err != nil {
			return structs.YoutubeResolveResponseDto{}, err
		}
		resolved, err = getItemUrl(formats, formatID)
		if err != nil {
			return structs.YoutubeResolveResponseDto{}, err
		}
	}
	return resolved, nil
}

// isResolvedURLExpired reports whether a googlevideo (or similar) URL has passed
// its expire query param. Missing/invalid expire is treated as expired.
func isResolvedURLExpired(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return true
	}
	expireStr := parsed.Query().Get("expire")
	if expireStr == "" {
		return true
	}
	expire, err := strconv.ParseInt(expireStr, 10, 64)
	if err != nil {
		return true
	}
	return expire < time.Now().Unix()
}

func getItemUrl(formats []structs.YoutubeFormatDto, formatID string) (structs.YoutubeResolveResponseDto, error) {
	for _, f := range formats {
		if f.FormatID == formatID {
			if f.URL == "" {
				return structs.YoutubeResolveResponseDto{}, fmt.Errorf("format không có URL")
			}

			return structs.YoutubeResolveResponseDto{
				URL:         f.URL,
				Ext:         f.Ext,
				Kind:        f.Kind,
				AvailableAt: f.AvailableAt,
			}, nil
		}
	}
	return structs.YoutubeResolveResponseDto{}, fmt.Errorf("không tìm thấy format %s", formatID)
}

func ToItemDto(item entities.YoutubePlaylistItem) structs.YoutubePlaylistItemDto {
	return structs.YoutubePlaylistItemDto{
		ID:         item.ID,
		YoutubeID:  item.YoutubeID,
		Title:      item.Title,
		Thumbnail:  item.Thumbnail,
		Duration:   item.Duration,
		Channel:    item.Channel,
		WebpageURL: item.WebpageURL,
		Position:   item.Position,
		CreatedAt:  item.CreatedAt,
		UpdatedAt:  item.UpdatedAt,
	}
}

func cachedFormats(item entities.YoutubePlaylistItem) ([]structs.YoutubeFormatDto, bool) {
	if item.FormatsJSON == "" || item.ProbedAt.IsZero() {
		return nil, false
	}
	if time.Since(item.ProbedAt) > formatsCacheTTL() {
		return nil, false
	}
	formats, err := structs.FormatsFromJSON(item.FormatsJSON)
	if err != nil || len(formats) == 0 {
		return nil, false
	}
	return formats, true
}

func refreshFormats(ctx context.Context, item entities.YoutubePlaylistItem) (entities.YoutubePlaylistItem, []structs.YoutubeFormatDto, error) {
	probe, err := YtDlpService.Probe(ctx, item.WebpageURL)
	if err != nil {
		return item, nil, err
	}
	formatsJSON, err := structs.FormatsToJSON(probe.Formats)
	if err != nil {
		return item, nil, err
	}
	item.Title = probe.Title
	item.Thumbnail = probe.Thumbnail
	item.Duration = probe.Duration
	item.Channel = probe.Channel
	item.WebpageURL = probe.WebpageURL
	item.FormatsJSON = formatsJSON
	item.ProbedAt = time.Now()
	if err := Global.DB.Save(&item).Error; err != nil {
		return item, nil, err
	}
	return item, probe.Formats, nil
}

func nextPosition(userID string) (int, error) {
	var maxPos *int
	err := Global.DB.Model(&entities.YoutubePlaylistItem{}).
		Where("user_id = ?", userID).
		Select("MAX(position)").
		Scan(&maxPos).Error
	if err != nil {
		return 0, err
	}
	if maxPos == nil {
		return 0, nil
	}
	return *maxPos + 1, nil
}

func extractYoutubeID(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "youtu.be" || host == "www.youtu.be" {
		id := strings.Trim(parsed.Path, "/")
		if i := strings.IndexByte(id, '/'); i >= 0 {
			id = id[:i]
		}
		return id
	}
	q := parsed.Query().Get("v")
	if q != "" {
		return q
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	for i := 0; i+1 < len(parts); i++ {
		switch parts[i] {
		case "shorts", "embed", "live", "v":
			return parts[i+1]
		}
	}
	return ""
}
