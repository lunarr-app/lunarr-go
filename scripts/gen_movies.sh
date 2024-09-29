#!/bin/bash

# Path to your config file
CONFIG_FILE="lunarr.yml"

# Read TMDB access token from the config file using awk
TMDB_ACCESS_TOKEN=$(awk -F': ' '/access_token:/ {print $2}' "$CONFIG_FILE" | xargs)

# Check if the access token is empty
if [ -z "$TMDB_ACCESS_TOKEN" ]; then
  echo "Error: TMDB access token not found in the config file."
  exit 1
fi

# TMDB API URL for fetching popular movies
TMDB_API_URL="https://api.themoviedb.org/3/movie/popular"

# Create a directory to store movie files if it doesn't exist
MOVIE_DIR="./test_movies"
mkdir -p "$MOVIE_DIR"

# Arrays of random codecs and file sizes
CODECS=("x264" "x265")
FILESIZES=("700MB" "1.4GB" "3.5GB" "5GB")

# Variables to track unique movies
MOVIE_COUNT=0
MOVIE_LIMIT=100
PAGE=1
MOVIES_SEEN=""

# Fetch popular movies until we have 100 unique movies
while [ $MOVIE_COUNT -lt $MOVIE_LIMIT ]; do
  # Fetch movies from TMDB (20 movies per page)
  RESPONSE=$(curl -s -H "Authorization: Bearer $TMDB_ACCESS_TOKEN" "$TMDB_API_URL?page=$PAGE")

  # Extract movies using jq
  for i in $(seq 0 19); do
    MOVIE_TITLE=$(echo "$RESPONSE" | jq -r ".results[$i].title")
    RELEASE_YEAR=$(echo "$RESPONSE" | jq -r ".results[$i].release_date" | cut -d '-' -f 1)

    # Skip if movie title is missing or already processed
    if [ -z "$MOVIE_TITLE" ] || [ "$MOVIE_TITLE" == "null" ] || echo "$MOVIES_SEEN" | grep -q "$MOVIE_TITLE"; then
      continue
    fi

    # Replace spaces with dots in the movie title
    MOVIE_TITLE=$(echo "$MOVIE_TITLE" | tr ' ' '.')

    # Pick random codec and file size using Bash arithmetic
    CODEC="${CODECS[$((RANDOM % ${#CODECS[@]}))]}"
    FILESIZE="${FILESIZES[$((RANDOM % ${#FILESIZES[@]}))]}"

    # Generate the final movie filename
    FILENAME="${MOVIE_TITLE}.${RELEASE_YEAR}.1080p.BluRay.${CODEC}-${FILESIZE}.mkv"

    # Create the movie file
    touch "${MOVIE_DIR}/${FILENAME}"
    echo "Created: ${FILENAME}"

    # Mark the movie as seen (by appending to MOVIES_SEEN)
    MOVIES_SEEN="${MOVIES_SEEN}${MOVIE_TITLE}\n"

    # Increment movie count
    MOVIE_COUNT=$((MOVIE_COUNT + 1))

    # Break the loop once we have 100 movies
    if [ $MOVIE_COUNT -ge $MOVIE_LIMIT ]; then
      break
    fi
  done

  # Move to the next page of results
  PAGE=$((PAGE + 1))
done

echo "Generated $MOVIE_COUNT movie files in $MOVIE_DIR"
