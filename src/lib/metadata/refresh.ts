export const METADATA_REFRESH_INTERVAL_OPTIONS = [
  { value: "", label: "Off" },
  { value: "24", label: "Daily" },
  { value: "168", label: "Weekly" },
  { value: "720", label: "Monthly" },
] as const;

export type MetadataRefreshKind = "movie" | "tv";

export const METADATA_REFRESH_FIELDS: {
  kind: MetadataRefreshKind;
  title: string;
  intervalField: string;
  stalenessField: string;
}[] = [
  {
    kind: "movie",
    title: "Movies",
    intervalField: "movieMetadataRefreshIntervalHours",
    stalenessField: "movieMetadataStalenessDays",
  },
  {
    kind: "tv",
    title: "TV shows",
    intervalField: "tvMetadataRefreshIntervalHours",
    stalenessField: "tvMetadataStalenessDays",
  },
];
