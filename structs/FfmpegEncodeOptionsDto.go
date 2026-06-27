package structs

import "strconv"

type FfmpegEncodeOptionsDto struct {
	FPS          int
	VideoCodec   string
	AudioCodec   string
	CRF          int
	VideoBitrate string
	AudioBitrate string
	Preset       string
	PixelFormat  string
	Scale        string
	ExtraArgs    []string
}

func (o FfmpegEncodeOptionsDto) BuildArgs() []string {
	var args []string

	if o.VideoCodec != "" {
		args = append(args, "-c:v", o.VideoCodec)
	}
	if o.AudioCodec != "" {
		args = append(args, "-c:a", o.AudioCodec)
	}
	if o.CRF > 0 {
		args = append(args, "-crf", strconv.Itoa(o.CRF))
	}
	if o.VideoBitrate != "" {
		args = append(args, "-b:v", o.VideoBitrate)
	}
	if o.AudioBitrate != "" {
		args = append(args, "-b:a", o.AudioBitrate)
	}
	if o.Preset != "" {
		args = append(args, "-preset", o.Preset)
	}
	if o.PixelFormat != "" {
		args = append(args, "-pix_fmt", o.PixelFormat)
	}
	if o.Scale != "" {
		args = append(args, "-vf", "scale="+o.Scale)
	}
	if o.FPS > 0 {
		args = append(args, "-r", strconv.Itoa(o.FPS))
	}
	if len(o.ExtraArgs) > 0 {
		args = append(args, o.ExtraArgs...)
	}

	return args
}
