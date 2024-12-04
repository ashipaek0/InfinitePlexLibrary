// src/config/index.ts

export const config = {
    RADARR_URL: process.env.RADARR_URL as string,
    RADARR_API_KEY: process.env.RADARR_API_KEY as string,
    RADARR_MOVIE_FOLDER: process.env.RADARR_MOVIE_FOLDER as string,
    RADARR_MONITOR_TAG_NAME: process.env.RADARR_MONITOR_TAG_NAME as string,

    TAUTULLI_URL: process.env.TAUTULLI_URL as string,
    TAUTULLI_API_KEY: process.env.TAUTULLI_API_KEY as string,
    TAUTULLI_STREAM_TERMINATED_MESSAGE: process.env.TAUTULLI_STREAM_TERMINATED_MESSAGE as string,

    PLEX_MOVIES_LIBRARY_ID: process.env.PLEX_MOVIES_LIBRARY_ID as string,
    PLEX_SERIES_LIBRARY_ID: process.env.PLEX_SERIES_LIBRARY_ID as string,
    PLEX_TOKEN: process.env.PLEX_TOKEN as string,
    PLEX_URL: process.env.PLEX_URL as string,
    PLEX_MOVIE_FOLDER: process.env.PLEX_MOVIE_FOLDER as string,
    PLEX_SERIES_FOLDER: process.env.PLEX_SERIES_FOLDER as string,

    MOVIE_FOLDER_DUMMY: process.env.MOVIE_FOLDER_DUMMY as string,
    DUMMY_FILE_LOCATION: process.env.DUMMY_FILE_LOCATION as string,
    SERIES_FOLDER_DUMMY: process.env.SERIES_FOLDER_DUMMY as string,

    RADARR_4K_URL: process.env.RADARR_4K_URL as string,
    RADARR_4K_API_KEY: process.env.RADARR_4K_API_KEY as string,
    RADARR_4K_MOVIE_FOLDER: process.env.RADARR_4K_MOVIE_FOLDER as string,
    RADARR_4K_QUALITY_PROFILE_ID: process.env.RADARR_4K_QUALITY_PROFILE_ID as string,

    SONARR_URL: process.env.SONARR_URL as string,
    SONARR_API_KEY: process.env.SONARR_API_KEY as string,
    SONARR_MONITOR_TAG_NAME: process.env.SONARR_MONITOR_TAG_NAME as string

};

// Validatie van configuratie
const missingKeys = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missingKeys.length > 0) {
    throw new Error(`❌ Config is missing the following keys: ${missingKeys.join(", ")}`);
}

if (isNaN(Number(config.RADARR_4K_QUALITY_PROFILE_ID))) {
    throw new Error("❌ Config RADARR_4K_QUALITY_PROFILE_ID does not contain a valid numeric value");
}
