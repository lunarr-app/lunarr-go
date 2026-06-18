export type MovieBrowseRow = {
  id: string;
  title: string;
  sort_title: string;
  year: number | null;
  poster_path: string | null;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  file_count: number;
  latest_file_created_at: string | null;
};

export type MovieProgressRow = {
  media_item_id: string;
  media_file_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  completed: boolean | number;
  updated_at: string;
};

export type ShowBrowseRow = {
  id: string;
  title: string;
  sort_title: string;
  year: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  status: string | null;
  popularity: number | null;
  vote_average: number | null;
  episode_count: number;
  season_count: number;
  latest_file_created_at: string | null;
  latest_episode_release_date: string | null;
};

export type EpisodeBrowseRow = {
  id: string;
  title: string;
  overview: string | null;
  season_number: number | null;
  episode_number: number | null;
  release_date: string | null;
  runtime_seconds: number | null;
  poster_path: string | null;
  popularity: number | null;
  vote_average: number | null;
  season_id: string;
  season_title: string;
  show_id: string;
  show_title: string;
  show_sort_title: string;
  show_year: number | null;
  show_poster_path: string | null;
  show_backdrop_path: string | null;
  file_count: number;
  first_file_id: string | null;
  latest_file_created_at: string | null;
};
