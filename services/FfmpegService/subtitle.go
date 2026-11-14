package FfmpegService

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var subtitleTimestampPattern = regexp.MustCompile(`^(?:(\d{2,}):)?([0-5]?\d):([0-5]?\d)[,.](\d{3})$`)

func ValidateSubtitleFile(path string) error {
	if !supportedSubtitlePath(path) {
		return fmt.Errorf("subtitle file must have an .srt or .vtt extension")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read subtitle file: %w", err)
	}
	return validateSubtitleData(filepath.Ext(path), data)
}

func validateSubtitleData(ext string, data []byte) error {
	if !utf8.Valid(data) {
		return fmt.Errorf("subtitle file must be UTF-8 encoded")
	}

	text := strings.TrimPrefix(string(data), "\uFEFF")
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	isVTT := strings.EqualFold(ext, ".vtt")
	if isVTT {
		if len(lines) == 0 || !strings.HasPrefix(strings.TrimSpace(lines[0]), "WEBVTT") {
			return fmt.Errorf("invalid VTT subtitle: missing WEBVTT header")
		}
	}

	cueCount := 0
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if !strings.Contains(line, "-->") {
			continue
		}

		parts := strings.SplitN(line, "-->", 2)
		start, err := parseSubtitleTimestamp(strings.TrimSpace(parts[0]), isVTT)
		if err != nil {
			return fmt.Errorf("invalid subtitle cue %d start time: %w", cueCount+1, err)
		}
		endText := strings.Fields(strings.TrimSpace(parts[1]))
		if len(endText) == 0 {
			return fmt.Errorf("invalid subtitle cue %d end time", cueCount+1)
		}
		end, err := parseSubtitleTimestamp(endText[0], isVTT)
		if err != nil {
			return fmt.Errorf("invalid subtitle cue %d end time: %w", cueCount+1, err)
		}
		if end <= start {
			return fmt.Errorf("invalid subtitle cue %d: end time must be after start time", cueCount+1)
		}

		hasText := false
		for j := i + 1; j < len(lines) && strings.TrimSpace(lines[j]) != ""; j++ {
			hasText = true
		}
		if !hasText {
			return fmt.Errorf("invalid subtitle cue %d: text is required", cueCount+1)
		}
		cueCount++
	}
	if cueCount == 0 {
		return fmt.Errorf("subtitle file contains no valid cues")
	}
	return nil
}

func parseSubtitleTimestamp(value string, isVTT bool) (float64, error) {
	match := subtitleTimestampPattern.FindStringSubmatch(value)
	if match == nil {
		return 0, fmt.Errorf("invalid timestamp %q", value)
	}

	hours := 0
	if match[1] != "" {
		parsed, err := strconv.Atoi(match[1])
		if err != nil {
			return 0, fmt.Errorf("invalid timestamp %q", value)
		}
		hours = parsed
	} else if !isVTT {
		return 0, fmt.Errorf("SRT timestamp must include hours")
	}
	minutes, _ := strconv.Atoi(match[2])
	seconds, _ := strconv.Atoi(match[3])
	millis, _ := strconv.Atoi(match[4])

	return float64(hours*3600+minutes*60+seconds) + float64(millis)/1000, nil
}

func supportedSubtitlePath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".srt" || ext == ".vtt"
}
