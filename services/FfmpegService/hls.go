package FfmpegService

import (
	"app/structs"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
)

func WriteHLSPlaylist(path string, segments []structs.SegmentResultDto) error {
	if len(segments) == 0 {
		return fmt.Errorf("no segments for HLS playlist")
	}

	var maxDuration float64
	for _, seg := range segments {
		if seg.Duration > maxDuration {
			maxDuration = seg.Duration
		}
	}

	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	b.WriteString("#EXT-X-VERSION:3\n")
	b.WriteString(fmt.Sprintf("#EXT-X-TARGETDURATION:%d\n", int(math.Ceil(maxDuration))))
	b.WriteString("#EXT-X-MEDIA-SEQUENCE:0\n")

	for _, seg := range segments {
		b.WriteString(fmt.Sprintf("#EXTINF:%.6f,\n", seg.Duration))
		b.WriteString(filepath.Base(seg.Path) + "\n")
	}

	b.WriteString("#EXT-X-ENDLIST\n")

	return os.WriteFile(path, []byte(b.String()), 0o644)
}
