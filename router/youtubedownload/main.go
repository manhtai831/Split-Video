package youtubedownload

import (
	"app/entities"
	"app/middleware"
	"app/services/YoutubePlaylistService"
	"app/structs"
	"app/templates"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

var errInvalidCategoryID = errors.New("invalid category_id")

func listPlaylistItems(userID, categoryIDRaw string) ([]entities.YoutubePlaylistItem, error) {
	categoryIDRaw = strings.TrimSpace(categoryIDRaw)
	if categoryIDRaw == "" {
		return YoutubePlaylistService.ListByUser(userID)
	}
	categoryID, err := strconv.Atoi(categoryIDRaw)
	if err != nil || categoryID < 1 {
		return nil, errInvalidCategoryID
	}
	return YoutubePlaylistService.ListByCategory(userID, categoryID)
}

func Bootstrap() {
	http.HandleFunc("/video/youtube-download", handlePage)
	http.HandleFunc("/video/youtube-download/sw.js", handleServiceWorker)
	http.HandleFunc("/youtube-download", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/video/youtube-download", http.StatusMovedPermanently)
	})
	http.HandleFunc("/api/youtube-download/playlist", handlePlaylistCollection)
	http.HandleFunc("/api/youtube-download/playlist/", handlePlaylistItem)
	http.HandleFunc("/api/youtube-download/categories", handleCategoriesCollection)
	http.HandleFunc("/api/youtube-download/categories/", handleCategoryItem)
}

func handlePage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserID(w, r)
	data := structs.PageData{
		Title:         "Tải Video YouTube — Download YouTube MP3, MP4 Online Miễn Phí",
		Description:   "Tải video YouTube, download YouTube MP3/MP4 online miễn phí. Nghe xem trực tiếp, chọn chất lượng, thêm playlist — youtube to mp3, youtube downloader nhanh.",
		DescriptionEN: "Free YouTube video downloader online — download YouTube MP4, YouTube to MP3, audio & playlist. Play in browser, pick quality, save download links fast.",
		ActivePage:    "youtube-download",
		UserID:        userID,
		Breadcrumbs:   structs.ToolBreadcrumbs("YouTube Download", "/video/youtube-download"),
	}
	data.Finalize()

	if err := templates.Render(w, r, "templates/pages/youtube-download.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func handleCategoriesCollection(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)

	switch r.Method {
	case http.MethodGet:
		cats, err := YoutubePlaylistService.ListCategories(userID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dtos := make([]structs.YoutubePlaylistCategoryDto, 0, len(cats))
		for _, cat := range cats {
			dtos = append(dtos, YoutubePlaylistService.ToCategoryDto(cat))
		}
		writeJSON(w, structs.YoutubePlaylistCategoryListResponseDto{Categories: dtos})

	case http.MethodPost:
		var req structs.YoutubePlaylistCategoryCreateRequestDto
		if err := decodeJSONBody(r, &req); err != nil {
			http.Error(w, "Body JSON không hợp lệ", http.StatusBadRequest)
			return
		}
		cat, err := YoutubePlaylistService.CreateCategory(userID, req.Name)
		if err != nil {
			if errors.Is(err, YoutubePlaylistService.ErrCategoryNameRequired) {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, YoutubePlaylistService.ToCategoryDto(cat))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleCategoryItem(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	path := strings.TrimPrefix(r.URL.Path, "/api/youtube-download/categories/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	id, err := strconv.Atoi(path)
	if err != nil || id < 1 {
		http.Error(w, "ID không hợp lệ", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPatch:
		var req structs.YoutubePlaylistCategoryPatchRequestDto
		if err := decodeJSONBody(r, &req); err != nil {
			http.Error(w, "Body JSON không hợp lệ", http.StatusBadRequest)
			return
		}
		var catDto structs.YoutubePlaylistCategoryDto
		if req.Name != nil {
			cat, err := YoutubePlaylistService.RenameCategory(id, userID, *req.Name)
			if err != nil {
				writeCategoryError(w, err)
				return
			}
			catDto = YoutubePlaylistService.ToCategoryDto(cat)
		}
		if req.Position != nil {
			cat, err := YoutubePlaylistService.UpdateCategoryPosition(id, userID, *req.Position)
			if err != nil {
				writeCategoryError(w, err)
				return
			}
			catDto = YoutubePlaylistService.ToCategoryDto(cat)
		}
		if req.Name == nil && req.Position == nil {
			http.Error(w, "Cần name hoặc position", http.StatusBadRequest)
			return
		}
		writeJSON(w, catDto)

	case http.MethodDelete:
		if err := YoutubePlaylistService.DeleteCategory(id, userID); err != nil {
			writeCategoryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handlePlaylistCollection(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)

	switch r.Method {
	case http.MethodGet:
		items, err := listPlaylistItems(userID, r.URL.Query().Get("category_id"))
		if err != nil {
			if errors.Is(err, errInvalidCategoryID) {
				http.Error(w, "category_id không hợp lệ", http.StatusBadRequest)
				return
			}
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Không tìm thấy category", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dtos, err := YoutubePlaylistService.ToItemDtos(userID, items)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, structs.YoutubePlaylistListResponseDto{Items: dtos})

	case http.MethodPost:
		var req structs.YoutubePlaylistAddRequestDto
		if err := decodeJSONBody(r, &req); err != nil {
			http.Error(w, "Body JSON không hợp lệ", http.StatusBadRequest)
			return
		}
		item, formats, err := YoutubePlaylistService.AddFromURL(r.Context(), userID, req.URL, req.CategoryID)
		if err != nil {
			YoutubePlaylistService.LogError(userID, "add_from_url", req.URL, err.Error())
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Không tìm thấy category", http.StatusNotFound)
				return
			}
			status := http.StatusBadRequest
			if strings.Contains(err.Error(), "không lấy được") || strings.Contains(err.Error(), "yt-dlp") {
				status = http.StatusBadGateway
			}
			http.Error(w, err.Error(), status)
			return
		}
		dto, err := YoutubePlaylistService.ToItemDtoWithFavorite(userID, item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, structs.YoutubePlaylistAddResponseDto{
			Item:    dto,
			Formats: formats,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handlePlaylistItem(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(w, r)
	path := strings.TrimPrefix(r.URL.Path, "/api/youtube-download/playlist/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.Split(path, "/")
	id, err := strconv.Atoi(parts[0])
	if err != nil || id < 1 {
		http.Error(w, "ID không hợp lệ", http.StatusBadRequest)
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodDelete:
			if err := YoutubePlaylistService.DeleteForUser(id, userID); err != nil {
				writeNotFoundOrError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		case http.MethodPatch:
			var req structs.YoutubeReorderRequestDto
			if err := decodeJSONBody(r, &req); err != nil {
				http.Error(w, "Body JSON không hợp lệ", http.StatusBadRequest)
				return
			}
			item, err := YoutubePlaylistService.UpdatePosition(id, userID, req.Position)
			if err != nil {
				writeNotFoundOrError(w, err)
				return
			}
			dto, err := YoutubePlaylistService.ToItemDtoWithFavorite(userID, item)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, dto)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	if len(parts) == 2 && parts[1] == "favorite" {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		item, isFav, err := YoutubePlaylistService.ToggleFavorite(userID, id)
		if err != nil {
			writeNotFoundOrError(w, err)
			return
		}
		dto, err := YoutubePlaylistService.ToItemDtoWithFavorite(userID, item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dto.IsFavorite = isFav
		writeJSON(w, dto)
		return
	}

	if len(parts) == 3 && parts[1] == "categories" {
		categoryID, err := strconv.Atoi(parts[2])
		if err != nil || categoryID < 1 {
			http.Error(w, "category_id không hợp lệ", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPost:
			if err := YoutubePlaylistService.LinkItemToUserCategory(userID, id, categoryID); err != nil {
				writeItemCategoryError(w, err)
				return
			}
		case http.MethodDelete:
			if err := YoutubePlaylistService.UnlinkItemFromUserCategory(userID, id, categoryID); err != nil {
				writeItemCategoryError(w, err)
				return
			}
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		item, err := YoutubePlaylistService.GetByIDForUser(id, userID)
		if err != nil {
			writeNotFoundOrError(w, err)
			return
		}
		dto, err := YoutubePlaylistService.ToItemDtoWithFavorite(userID, item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, dto)
		return
	}

	if len(parts) == 2 && parts[1] == "formats" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		item, formats, err := YoutubePlaylistService.GetFormats(r.Context(), id, userID)
		if err != nil {
			writeNotFoundOrError(w, err)
			return
		}
		dto, err := YoutubePlaylistService.ToItemDtoWithFavorite(userID, item)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, structs.YoutubeFormatsResponseDto{
			Item:    dto,
			Formats: formats,
		})
		return
	}

	if len(parts) == 2 && parts[1] == "resolve" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		formatID := r.URL.Query().Get("format_id")
		resolved, err := YoutubePlaylistService.ResolveFormat(r.Context(), id, userID, formatID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				http.Error(w, "Không tìm thấy mục playlist", http.StatusNotFound)
				return
			}
			status := http.StatusBadRequest
			if strings.Contains(err.Error(), "không lấy được") || strings.Contains(err.Error(), "yt-dlp") {
				status = http.StatusBadGateway
			}
			http.Error(w, err.Error(), status)
			return
		}
		writeJSON(w, resolved)
		return
	}

	if len(parts) == 2 && parts[1] == "stream" {
		handleStream(w, r, id, userID)
		return
	}

	if len(parts) == 2 && parts[1] == "download" {
		handleDownload(w, r, id, userID)
		return
	}

	http.NotFound(w, r)
}

func writeCategoryError(w http.ResponseWriter, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, "Không tìm thấy category", http.StatusNotFound)
		return
	}
	if errors.Is(err, YoutubePlaylistService.ErrCategorySystemProtected) ||
		errors.Is(err, YoutubePlaylistService.ErrCategoryNameRequired) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func writeItemCategoryError(w http.ResponseWriter, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, "Không tìm thấy mục hoặc category", http.StatusNotFound)
		return
	}
	if errors.Is(err, YoutubePlaylistService.ErrCategorySystemProtected) {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func writeNotFoundOrError(w http.ResponseWriter, err error) {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		http.Error(w, "Không tìm thấy mục playlist", http.StatusNotFound)
		return
	}
	if strings.Contains(err.Error(), "không lấy được") || strings.Contains(err.Error(), "yt-dlp") {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func decodeJSONBody(r *http.Request, dst any) error {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return errors.New("empty body")
	}
	return json.Unmarshal(body, dst)
}

func writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	_ = enc.Encode(data)
}
