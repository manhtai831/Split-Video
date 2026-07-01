package structs

import (
	"encoding/json"
	"fmt"
	"strings"
)

const MaxMergeClips = 200

type MergeItemMetaDto struct {
	Index        int     `json:"index"`
	Kind         string  `json:"kind"`
	HoldDuration float64 `json:"hold_duration,omitempty"`
}

func ParseItemsMeta(raw string, fileCount int) ([]MergeItemMetaDto, error) {
	if raw == "" {
		return nil, fmt.Errorf("items_meta is required")
	}

	var items []MergeItemMetaDto
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return nil, fmt.Errorf("invalid items_meta JSON: %w", err)
	}

	if len(items) < 2 {
		return nil, fmt.Errorf("cần ít nhất 2 clip (video hoặc ảnh)")
	}
	if len(items) > MaxMergeClips {
		return nil, fmt.Errorf("tối đa %d clip/ảnh mỗi lần ghép", MaxMergeClips)
	}
	if fileCount > 0 && len(items) != fileCount {
		return nil, fmt.Errorf("items_meta count (%d) does not match file count (%d)", len(items), fileCount)
	}

	seen := make(map[int]bool, len(items))
	for i, item := range items {
		if item.Index != i {
			return nil, fmt.Errorf("items_meta[%d]: index must be %d, got %d", i, i, item.Index)
		}
		if seen[item.Index] {
			return nil, fmt.Errorf("duplicate index %d in items_meta", item.Index)
		}
		seen[item.Index] = true

		kind := strings.ToLower(strings.TrimSpace(item.Kind))
		switch kind {
		case "video":
		case "image":
			if item.HoldDuration < 0.5 || item.HoldDuration > 60 {
				return nil, fmt.Errorf("items_meta[%d]: hold_duration must be between 0.5 and 60 for image", i)
			}
		case "gif":
			if item.HoldDuration < 0 || item.HoldDuration > 60 {
				return nil, fmt.Errorf("items_meta[%d]: hold_duration must be between 0 and 60 for gif", i)
			}
		default:
			return nil, fmt.Errorf("items_meta[%d]: invalid kind %q", i, item.Kind)
		}
		items[i].Kind = kind
	}

	return items, nil
}
