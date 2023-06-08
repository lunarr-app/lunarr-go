package db

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/dgraph-io/badger/v4"
	TMDb "github.com/lunarr-app/golang-tmdb"
	"github.com/lunarr-app/lunarr-go/internal/tmdb"
	"github.com/lunarr-app/lunarr-go/internal/util"
)

func initBadger(dataDir string) {
	util.Logger.Info().Msg("Opening Badger database")

	// Open Badger database
	var badgerDB *badger.DB
	var err error
	if os.Getenv("TEST_ENV") == "true" {
		badgerDB, err = badger.Open(badger.DefaultOptions("").WithInMemory(true))
	} else {
		badgerPath := filepath.Join(dataDir, "badger")
		badgerDB, err = badger.Open(badger.DefaultOptions(badgerPath).WithSyncWrites(true))
	}

	if err != nil {
		util.Logger.Fatal().Err(err).Msg("Failed to open Badger database")
	}
	BadgerDB = badgerDB
}

func FindMovieMetadata(tmdbID int) (*TMDb.MovieDetails, error) {
	// Check if the movie data exists in Badger
	key := "tmdb_movie:" + strconv.Itoa(tmdbID)
	movieData, err := retrieveMovieDataFromBadger(key)
	if err != nil {
		return nil, err
	}

	// If movie data doesn't exist in Badger, fetch it from TMDB
	if movieData == nil {
		movieData, err = fetchMovieDataFromTMDB(tmdbID)
		if err != nil {
			return nil, err
		}

		// Store the movie data in Badger
		err = storeMovieDataInBadger(key, movieData)
		if err != nil {
			return nil, err
		}
	}

	return movieData, nil
}

func retrieveMovieDataFromBadger(key string) (*TMDb.MovieDetails, error) {
	var movieData *TMDb.MovieDetails

	err := BadgerDB.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(key))
		if err != nil {
			if err == badger.ErrKeyNotFound {
				// Movie data not found in Badger
				return nil
			}
			return err
		}

		err = item.Value(func(val []byte) error {
			return json.Unmarshal(val, &movieData)
		})
		return err
	})

	if err != nil {
		return nil, err
	}

	return movieData, nil
}

func fetchMovieDataFromTMDB(tmdbID int) (*TMDb.MovieDetails, error) {
	movie, err := tmdb.TmdbClient.GetMovieDetails(tmdbID, nil)
	if err != nil {
		return nil, err
	}

	return movie, nil
}

func storeMovieDataInBadger(key string, movieData *TMDb.MovieDetails) error {
	movieJSON, err := json.Marshal(movieData)
	if err != nil {
		return err
	}

	err = BadgerDB.Update(func(txn *badger.Txn) error {
		// Set the TTL to 30 days
		entry := badger.NewEntry([]byte(key), movieJSON).WithTTL(30 * 24 * time.Hour)
		return txn.SetEntry(entry)
	})
	if err != nil {
		return err
	}

	return nil
}
