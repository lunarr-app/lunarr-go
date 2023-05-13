## API planned TO-DO's

```bash
├── GET /              # Get API information
├── POST /auth/login   # Authenticate user login
├── POST /auth/signup  # Create a new user account

├── GET /users         # Get list of all users (admin only)
├── GET /users/me      # Get authenticated user's details
├── PUT /users/me      # Update authenticated user's data

├── GET /media/movies           # Get list of all movies (with pagination)
│   ├── GET /media/movies/{movie_id}           # Get details of a specific movie
│   └── GET /media/movies/{movie_id}/stream    # Stream a specific movie

├── GET /media/tv-shows                 # Get list of all TV shows (with pagination)
│   ├── GET /media/tv-shows/{show_id}              # Get details of a specific TV show
│   ├── GET /media/tv-shows/{show_id}/episodes     # Get list of all episodes for a TV show
│   ├── GET /media/tv-shows/{show_id}/episodes/{episode_id}   # Get details of a specific episode of a TV show
│   └── GET /media/tv-shows/{show_id}/seasons/{season_number}/episodes/{episode_id}/stream  # Stream a specific TV show episode
```

_Feel free to suggest a better flow._
