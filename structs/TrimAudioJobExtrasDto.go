package structs

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type TrimAudioJobExtrasDto struct {
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	FadeIn  float64 `json:"fade_in"`
	FadeOut float64 `json:"fade_out"`
	// Fade is legacy (single value for both). Prefer FadeIn/FadeOut.
	Fade float64 `json:"fade,omitempty"`
}

func ParseTrimAudioForm(fields map[string]string) (TrimAudioJobExtrasDto, error) {
	start, err := parseTrimSeconds(fields["start"], "start", true)
	if err != nil {
		return TrimAudioJobExtrasDto{}, err
	}
	if start < 0 {
		return TrimAudioJobExtrasDto{}, fmt.Errorf("start must be >= 0, got %v", start)
	}

	endRaw := strings.TrimSpace(fields["end"])
	if endRaw == "" {
		return TrimAudioJobExtrasDto{}, fmt.Errorf("end is required")
	}
	end, err := parseTrimSeconds(endRaw, "end", false)
	if err != nil {
		return TrimAudioJobExtrasDto{}, err
	}
	if end <= start {
		return TrimAudioJobExtrasDto{}, fmt.Errorf("end must be greater than start (start=%v, end=%v)", start, end)
	}

	fadeIn, fadeOut, err := parseTrimFadeFields(fields)
	if err != nil {
		return TrimAudioJobExtrasDto{}, err
	}

	segDur := end - start
	if fadeIn+fadeOut > segDur {
		return TrimAudioJobExtrasDto{}, fmt.Errorf(
			"fade too long: fade_in+fade_out (%.3f) exceeds segment duration (%.3f)",
			fadeIn+fadeOut, segDur,
		)
	}

	return TrimAudioJobExtrasDto{
		Start:   start,
		End:     end,
		FadeIn:  fadeIn,
		FadeOut: fadeOut,
	}, nil
}

func parseTrimFadeFields(fields map[string]string) (fadeIn, fadeOut float64, err error) {
	hasIn := strings.TrimSpace(fields["fade_in"]) != ""
	hasOut := strings.TrimSpace(fields["fade_out"]) != ""
	hasLegacy := strings.TrimSpace(fields["fade"]) != ""

	if hasIn || hasOut {
		fadeIn, err = parseTrimSeconds(fields["fade_in"], "fade_in", true)
		if err != nil {
			return 0, 0, err
		}
		fadeOut, err = parseTrimSeconds(fields["fade_out"], "fade_out", true)
		if err != nil {
			return 0, 0, err
		}
	} else if hasLegacy {
		legacy, err := parseTrimSeconds(fields["fade"], "fade", true)
		if err != nil {
			return 0, 0, err
		}
		fadeIn, fadeOut = legacy, legacy
	}

	if fadeIn < 0 {
		return 0, 0, fmt.Errorf("fade_in must be >= 0, got %v", fadeIn)
	}
	if fadeOut < 0 {
		return 0, 0, fmt.Errorf("fade_out must be >= 0, got %v", fadeOut)
	}
	return fadeIn, fadeOut, nil
}

func parseTrimSeconds(raw, field string, allowEmpty bool) (float64, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		if allowEmpty {
			return 0, nil
		}
		return 0, fmt.Errorf("%s is required", field)
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %q", field, raw)
	}
	return v, nil
}

func (d TrimAudioJobExtrasDto) ToJSON() (string, error) {
	out := struct {
		Start   float64 `json:"start"`
		End     float64 `json:"end"`
		FadeIn  float64 `json:"fade_in"`
		FadeOut float64 `json:"fade_out"`
	}{
		Start:   d.Start,
		End:     d.End,
		FadeIn:  d.FadeIn,
		FadeOut: d.FadeOut,
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ParseTrimAudioJobExtrasJSON(raw string) (TrimAudioJobExtrasDto, error) {
	if raw == "" {
		return TrimAudioJobExtrasDto{}, fmt.Errorf("empty extras")
	}
	var extras TrimAudioJobExtrasDto
	if err := json.Unmarshal([]byte(raw), &extras); err != nil {
		return TrimAudioJobExtrasDto{}, err
	}
	if extras.FadeIn == 0 && extras.FadeOut == 0 && extras.Fade > 0 {
		extras.FadeIn = extras.Fade
		extras.FadeOut = extras.Fade
	}
	extras.Fade = 0
	return extras, nil
}

func (d TrimAudioJobExtrasDto) SegmentDuration() float64 {
	return d.End - d.Start
}

func (d TrimAudioJobExtrasDto) HasFade() bool {
	return d.FadeIn > 0 || d.FadeOut > 0
}
