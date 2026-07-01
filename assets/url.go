package assets

func URL(logicalPath string) string {
	if hashed, ok := Manifest[logicalPath]; ok {
		return "/static/" + hashed
	}
	return "/static/" + logicalPath
}
