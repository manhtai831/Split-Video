package structs

type UploadPrepareFileMeta struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	TotalParts int    `json:"total_parts"`
}

type UploadPrepareRequest struct {
	FileCount int                     `json:"file_count"`
	Files     []UploadPrepareFileMeta `json:"files"`
}

type UploadSlotDto struct {
	Index  int    `json:"index"`
	Folder string `json:"folder"`
}

type UploadPrepareResponse struct {
	SessionID string          `json:"session_id"`
	Slots     []UploadSlotDto `json:"slots"`
}

type UploadPartResponse struct {
	OK bool `json:"ok"`
}

type UploadCompleteItem struct {
	Folder     string `json:"folder"`
	FileName   string `json:"file_name"`
	TotalParts int    `json:"total_parts"`
}

type UploadCompleteRequest struct {
	Items []UploadCompleteItem `json:"items"`
}

type UploadCompletedFileDto struct {
	Index int    `json:"index"`
	Path  string `json:"path"`
	Name  string `json:"name"`
	Size  int64  `json:"size"`
}

type UploadCompleteResponse struct {
	Files []UploadCompletedFileDto `json:"files"`
}

type PreuploadedFileDto struct {
	Path string `json:"path"`
	Name string `json:"name"`
}
