export type CastMediaUpdateListener = (isAlive: boolean) => void;

export type CastMediaSession = {
  playerState?: string;
  currentTime?: number;
  media?: {
    duration?: number;
  };
  addUpdateListener?: (listener: CastMediaUpdateListener) => void;
  removeUpdateListener?: (listener: CastMediaUpdateListener) => void;
  play?: (
    request: null,
    successCallback: () => void,
    errorCallback: () => void,
  ) => void;
  pause?: (
    request: null,
    successCallback: () => void,
    errorCallback: () => void,
  ) => void;
  seek?: (
    request: CastSeekRequest,
    successCallback: () => void,
    errorCallback: () => void,
  ) => void;
};

export type CastSession = {
  getMediaSession?: () => CastMediaSession | null;
  loadMedia?: (request: CastLoadRequest) => Promise<CastMediaSession>;
  endSession?: (stopCasting: boolean) => void;
};

export type ConnectedCastSession = CastSession & {
  loadMedia: (request: CastLoadRequest) => Promise<CastMediaSession>;
};

export type CastRemotePlayer = {
  isConnected?: boolean;
  isMediaLoaded?: boolean;
  isPaused?: boolean;
  playerState?: string;
  currentTime?: number;
  duration?: number;
};

export type CastRemotePlayerController = {
  addEventListener: (eventType: string, listener: () => void) => void;
  removeEventListener: (eventType: string, listener: () => void) => void;
  playOrPause?: () => void;
  seek?: () => void;
};

export type CastMediaMetadata = {
  title?: string;
};

export type CastTrack = {
  trackContentId?: string;
  trackContentType?: string;
  name?: string;
  language?: string;
  subtype?: string;
};

export type CastMediaInfo = {
  metadata?: CastMediaMetadata;
  duration?: number;
  tracks?: CastTrack[];
};

export type CastLoadRequest = {
  autoplay?: boolean;
  currentTime?: number;
  activeTrackIds?: number[];
};

export type CastSeekRequest = {
  currentTime?: number;
};

export type CastFrameworkContext = {
  setOptions: (options: {
    receiverApplicationId: string;
    autoJoinPolicy: string;
  }) => void;
  getCurrentSession?: () => CastSession | null;
  requestSession: () => Promise<CastSession | null | undefined>;
  addEventListener: (
    eventType: string,
    listener: (event: { sessionState: string }) => void,
  ) => void;
  removeEventListener: (
    eventType: string,
    listener: (event: { sessionState: string }) => void,
  ) => void;
};

export type CastApi = {
  cast: {
    framework: {
      CastContext: {
        getInstance: () => CastFrameworkContext;
      };
      RemotePlayer: new () => CastRemotePlayer;
      RemotePlayerController: new (
        player: CastRemotePlayer,
      ) => CastRemotePlayerController;
      RemotePlayerEventType: {
        ANY_CHANGE: string;
      };
      CastContextEventType: {
        SESSION_STATE_CHANGED: string;
      };
      SessionState: {
        SESSION_ENDED: string;
        SESSION_STARTED: string;
        SESSION_RESUMED: string;
        SESSION_START_FAILED: string;
      };
    };
  };
  chrome: {
    cast: {
      AutoJoinPolicy: {
        ORIGIN_SCOPED: string;
      };
      media: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (
          contentId: string,
          contentType: string,
        ) => CastMediaInfo;
        MovieMediaMetadata: new () => CastMediaMetadata;
        Track: new (trackId: number, trackType: string) => CastTrack;
        TrackType: {
          TEXT: string;
        };
        TextTrackType: {
          SUBTITLES: string;
        };
        LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
        SeekRequest: new () => CastSeekRequest;
      };
    };
  };
};

export function connectedCastSession(
  session: CastSession | null | undefined,
): ConnectedCastSession | null {
  return session?.loadMedia ? (session as ConnectedCastSession) : null;
}
