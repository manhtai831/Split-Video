package enums

import "fmt"

type SplitMode string

const (
	SplitModeSize SplitMode = "size"
	SplitModeTime SplitMode = "time"
)

func ParseSplitMode(raw string) (SplitMode, error) {
	if raw == "" {
		return SplitModeSize, nil
	}
	switch SplitMode(raw) {
	case SplitModeSize, SplitModeTime:
		return SplitMode(raw), nil
	default:
		return "", fmt.Errorf("invalid split_mode: %q", raw)
	}
}

func (m SplitMode) OrDefault() SplitMode {
	if m == "" {
		return SplitModeSize
	}
	return m
}
