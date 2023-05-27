package tmdb

func GetImageURL(path string) string {
	return "https://image.tmdb.org/t/p/w500" + path
}

func FormatReleaseDate(date string) string {
	return date[:4]
}
