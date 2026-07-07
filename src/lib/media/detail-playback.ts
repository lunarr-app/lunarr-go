import { formatMediaDuration } from "./format";

export type DetailFileProgress = {
  media_file_id: string;
  position_seconds: number;
  duration_seconds: number | null;
  completed: boolean | number;
  updated_at: string;
};

export type DetailMediaFile = {
  id: string;
};

function latestCompletedProgress(progress: DetailFileProgress[]) {
  return [...progress]
    .filter((item) => Boolean(item.completed))
    .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
}

function latestResumeProgress(progress: DetailFileProgress[], hasCompletedProgress: boolean) {
  if (hasCompletedProgress) return undefined;
  return [...progress]
    .filter((item) => !Boolean(item.completed) && Number(item.position_seconds ?? 0) > 0)
    .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))[0];
}

export function detailPrimaryActionLabel(
  resumeProgress: DetailFileProgress | undefined,
  hasCompletedProgress: boolean,
) {
  return resumeProgress ? "Resume" : hasCompletedProgress ? "Play again" : "Play";
}

export function detailResumeLabel(resumeProgress: DetailFileProgress | undefined) {
  if (!resumeProgress) return null;
  const position = Math.max(0, Math.floor(Number(resumeProgress.position_seconds ?? 0)));
  const duration =
    resumeProgress.duration_seconds === null ? null : Math.max(0, Math.floor(Number(resumeProgress.duration_seconds)));
  if (!duration) return `Resume at ${formatMediaDuration(position)}`;
  return `Resume at ${formatMediaDuration(position)} of ${formatMediaDuration(duration)}`;
}

export function detailResumePercent(resumeProgress: DetailFileProgress | undefined) {
  if (!resumeProgress?.duration_seconds) return 0;
  return Math.min(
    99,
    Math.max(
      0,
      Math.round((Number(resumeProgress.position_seconds ?? 0) / Number(resumeProgress.duration_seconds)) * 100),
    ),
  );
}

export function deriveDetailPlaybackState<T extends DetailMediaFile>(files: T[], progress: DetailFileProgress[]) {
  const completedProgress = latestCompletedProgress(progress);
  const hasCompletedProgress = Boolean(completedProgress);
  const resumeProgress = latestResumeProgress(progress, hasCompletedProgress);
  const primaryFile =
    files.find((file) => file.id === (resumeProgress ?? completedProgress)?.media_file_id) ?? files[0];

  return {
    completedProgress,
    hasCompletedProgress,
    resumeProgress,
    primaryFile,
    primaryActionLabel: detailPrimaryActionLabel(resumeProgress, hasCompletedProgress),
    resumeLabel: detailResumeLabel(resumeProgress),
    resumePercent: detailResumePercent(resumeProgress),
  };
}
