package structs

type MediaProbeDto struct {
	Duration   float64
	Width      int
	Height     int
	FPS        float64
	VideoCodec string
	AudioCodec string
	Bitrate    int64
	Format     string
}
