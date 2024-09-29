# Configuration for Lunarr

The Lunarr application allows you to configure various settings via a `lunarr.yml` file, environment variables, or a combination of both. This document outlines all the configuration options available and their usage.

## Configuration Options

### Server Settings

The `server` section configures the IP address and port for the Lunarr server.

```yaml
server:
  host: "0.0.0.0" # The IP address or hostname the server binds to.
  port: 8484 # The port number the server listens on.
```

- `host`: Defaults to `127.0.0.1` (localhost). You can set this to `0.0.0.0` to bind to all interfaces.
- `port`: The port the server listens on. The default is `8484`.

### TMDb (The Movie Database) API Settings

The `tmdb` section configures the API key or access token used to interact with The Movie Database (TMDb) API.

```yaml
tmdb:
  api_key: "" # TMDb API key (v3)
  access_token: "" # TMDb access token (v4)
```

- **API Key**: If you have a v3 TMDb API key, provide it here.
- **Access Token**: Alternatively, you can provide a v4 access token. **Note**: Only one of `api_key` or `access_token` is required. If both are provided, the `api_key` will be used.

### Application Data Directory

The `app_data_dir` specifies the path where Lunarr stores its data.

```yaml
app_data_dir: "/path/to/app/data"
```

If left empty, the default path will be the user's config directory.

### Database Configuration

The `database` section configures the database connection. You can use either SQLite (default) or PostgreSQL.

```yaml
database:
  driver: "sqlite" # Database driver, options: "sqlite", "postgres"

  postgres: # PostgreSQL-specific configuration (only used if driver is "postgres").
    host: "localhost"
    port: 5432
    user: "postgres"
    password: "yourpassword"
    dbname: "lunarrdb"
```

- `driver`: Choose between `sqlite` or `postgres`.
- PostgreSQL options (used when `driver` is `postgres`):
  - `host`: The hostname of the PostgreSQL server.
  - `port`: The port number of the PostgreSQL server.
  - `user`: The username for the PostgreSQL connection.
  - `password`: The password for the PostgreSQL connection.
  - `dbname`: The database name to connect to.

### Application Settings

The `app_settings` section allows you to configure paths for movie and TV show locations, email SMTP settings, and user signup preferences.

#### Movie & TV Show Locations

You can specify the directories where Lunarr will scan for movies and TV shows.

```yaml
app_settings:
  movie_locations:
    - "/mnt/movies" # List of directories where movies are stored.
  tv_show_locations:
    - "/mnt/tvshows" # List of directories where TV shows are stored.
```

#### Email SMTP Settings

This section configures the SMTP settings for sending emails.

```yaml
email_smtp:
  smtp_server: "smtp.example.com" # SMTP server address.
  port: 587 # SMTP port.
  username: "your_smtp_username" # SMTP username.
  password: "your_smtp_password" # SMTP password.
```

- `smtp_server`: The SMTP server's address.
- `port`: The port number used by the SMTP server.
- `username`: Your SMTP account's username.
- `password`: Your SMTP account's password.

#### User Signup

Controls whether new users can sign up.

```yaml
new_user_signup: true
```

- `new_user_signup`: A boolean option that allows or disallows new user registrations. If set to `false`, new users cannot sign up.

### Environment Variables

In addition to the `lunarr.yml` file, you can override configuration values using environment variables. These variables are prefixed with `LUNARR_`.

#### Example Environment Variables:

```bash
export LUNARR_SERVER_HOST="192.168.1.100"
export LUNARR_SERVER_PORT=5050
export LUNARR_TMDB_API_KEY="your_tmdb_api_key"
export LUNARR_DATABASE_DRIVER="postgres"
export LUNARR_DATABASE_POSTGRES_HOST="db.example.com"
export LUNARR_APPSETTINGS_EMAIL_SMTP_SERVER="smtp.env.com"
export LUNARR_APPSETTINGS_NEW_USER_SIGNUP=false
export LUNARR_APPSETTINGS_MOVIE_LOCATIONS="/mnt/movies1,/mnt/movies2"
export LUNARR_APPSETTINGS_TV_SHOW_LOCATIONS="/mnt/tvshows1,/mnt/tvshows2"
```

### Notes on Configuration Priority:

- **YAML File**: The configuration in `lunarr.yml` will be loaded first.
- **Environment Variables**: If environment variables are provided, they will override the corresponding YAML values.
