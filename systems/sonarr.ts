import axios from "axios";
import { config } from "../config";
import { createDummyFile, ensureDirectoryExists } from "../utils";
import { updatePlexDescription } from "./plex";

/**
 * Retrieves a series from Sonarr using thetvdb_id.
 * @param tvdbId - The TVDB ID of the series.
 * @param sonarrUrl - The Sonarr API URL.
 * @param sonarrApiKey - The Sonarr API key.
 * @returns The series details from Sonarr or null if not found.
 */
export async function getSeriesByTvdbId(
    tvdbId: number,
    sonarrUrl: string,
    sonarrApiKey: string
): Promise<any | null> {
    try {
        const response = await axios.get(`${sonarrUrl}/series`, {
            headers: { "X-Api-Key": sonarrApiKey },
            params: { tvdbId }, // Pass tvdbId as a query parameter
        });

        if (response.data && response.data.length > 0) {
            const series = response.data[0];
            console.log(`✅ Found series in Sonarr: ${series.title} (TVDB ID: ${tvdbId})`);
            return series;
        }

        console.log(`❌ No series found in Sonarr for TVDB ID: ${tvdbId}`);
        return null;
    } catch (error: any) {
        console.error(`❌ Error fetching series by TVDB ID ${tvdbId}: ${error.message}`);
        return null;
    }
}
/**
 * Fetches all episodes of a series by its series ID from Sonarr, optionally filtered by season.
 * @param seriesId - The ID of the series in Sonarr.
 * @param seasonNumber - The specific season number to fetch (optional).
 * @returns Array of episodes belonging to the series or season.
 */
export async function getEpisodesBySeriesId(seriesId: number, seasonNumber?: number): Promise<any[]> {
    try {
        const params: any = {
            seriesId,
            includeEpisodeFile: true,
        };

        if (seasonNumber !== undefined) {
            params.seasonNumber = seasonNumber;
        }

        const { data: episodes } = await axios.get(`${config.SONARR_URL}/episode`, {
            params,
            headers: { "X-Api-Key": config.SONARR_API_KEY },
        });

        const seasonText = seasonNumber !== undefined ? `Season ${seasonNumber}` : "all seasons";
        console.log(`✅ Retrieved ${episodes.length} episodes for series ID ${seriesId}, ${seasonText}.`);
        return episodes;
    } catch (error: any) {
        console.error(
            `❌ Error fetching episodes for series ID ${seriesId}${seasonNumber !== undefined ? `, Season ${seasonNumber}` : ""}:`,
            error.message
        );
        throw error;
    }
}

/**
 * Groups episodes by season number.
 * @param episodes - Array of episodes.
 * @returns Object with seasons as keys and arrays of episodes as values.
 */
export function groupEpisodesBySeason(episodes: any[]): Record<number, any[]> {
    return episodes.reduce((acc: Record<number, any[]>, episode: any) => {
        if (!acc[episode.seasonNumber]) {
            acc[episode.seasonNumber] = [];
        }
        acc[episode.seasonNumber].push(episode);
        return acc;
    }, {});
}

/**
 * Creates a dummy file for a specific season in the series folder.
 * @param seriesTitle - The title of the series.
 * @param seasonNumber - The season number.
 * @param episodes - Array of episodes for the season.
 * @param seriesFolder - The path to the series folder.
 * @param dummySource - Path to the source dummy file.
 */
export async function createSeasonDummyFile(
    seriesTitle: string,
    seasonNumber: number,
    episodes: any[],
    seriesFolder: string,
    dummySource: string
): Promise<void> {
    try {
        const seasonFolder = `${seriesFolder}/Season ${seasonNumber}`;
        await ensureDirectoryExists(seasonFolder);

        const dummyFileName = `${seriesTitle} - s${String(seasonNumber).padStart(2, "0")}e01-e${String(episodes.length).padStart(2, "0")}.mp4`;
        const dummyFilePath = `${seasonFolder}/${dummyFileName}`;

        await createDummyFile(dummySource, dummyFilePath);

        console.log(`✅ Created dummy file for season ${seasonNumber}: ${dummyFilePath}`);
    } catch (error: any) {
        console.error(`❌ Error creating dummy file for season ${seasonNumber}:`, error.message);
        throw error;
    }
}

/**
 * Fetches all tags from Sonarr.
 * @returns Array of tags in Sonarr.
 */
export async function getSonarrTags(): Promise<any[]> {
    try {
        const { data: tags } = await axios.get(`${config.SONARR_URL}/tag`, {
            headers: { "X-Api-Key": config.SONARR_API_KEY },
        });

        console.log(`✅ Retrieved ${tags.length} tags from Sonarr.`);
        return tags;
    } catch (error: any) {
        console.error("❌ Error fetching tags from Sonarr:", error.message);
        throw error;
    }
}

/**
 * Retrieves the ID of a tag by its name.
 * @param tagName - The name of the tag.
 * @returns The tag ID or null if not found.
 */
export async function getSonarrTagId(tagName: string): Promise<number | null> {
    try {
        const tags = await getSonarrTags();
        const tag = tags.find((t: any) => t.label === tagName);
        return tag ? tag.id : null;
    } catch (error: any) {
        console.error(`❌ Error fetching tag ID for "${tagName}":`, error.message);
        return null;
    }
}


/**
 * Monitors a series and its episodes in Sonarr.
 * @param seriesId - The ID of the series in Sonarr.
 */
export async function monitorSeries(seriesId: number): Promise<void> {
    try {
        const { data: series } = await axios.get(`${config.SONARR_URL}/series/${seriesId}`, {
            headers: { "X-Api-Key": config.SONARR_API_KEY },
        });

        if (series.monitored) {
            console.log(`✅ Series "${series.title}" is already monitored.`);
        } else {
            const updatedSeries = { ...series, monitored: true };
            await axios.put(`${config.SONARR_URL}/series`, updatedSeries, {
                headers: { "X-Api-Key": config.SONARR_API_KEY },
            });

            console.log(`🎬 Series "${series.title}" is now monitored.`);
        }
    } catch (error: any) {
        console.error(`❌ Error monitoring series ID ${seriesId}:`, error.message);
    }
}

/**
 * Monitors all seasons and episodes of a series in Sonarr.
 * @param seriesId - The Sonarr series ID.
 * @param sonarrUrl - The Sonarr API URL.
 * @param sonarrApiKey - The Sonarr API key.
 */
export async function monitorAllSeasons(
    seriesId: number,
    sonarrUrl: string,
    sonarrApiKey: string
): Promise<void> {
    try {
        console.log(`🔄 Fetching series details for ID: ${seriesId} to monitor all seasons...`);

        // Fetch series details from Sonarr
        const { data: series } = await axios.get(`${sonarrUrl}/series/${seriesId}`, {
            headers: { "X-Api-Key": sonarrApiKey },
        });

        // Update the series to monitor all seasons and episodes
        const updatedSeries = {
            ...series,
            monitored: true, // Set the entire series as monitored
            seasons: series.seasons.map((season: any) => ({
                ...season,
                monitored: true, // Set each season as monitored
            })),
        };

        await axios.put(`${sonarrUrl}/series`, updatedSeries, {
            headers: { "X-Api-Key": sonarrApiKey },
        });

        console.log(`✅ All seasons and episodes of series "${series.title}" are now monitored.`);
    } catch (error: any) {
        console.error(`❌ Error monitoring all seasons of series ID ${seriesId}: ${error.message}`);
    }
}

/**
 * Searches for a specific season or all seasons of a series in Sonarr.
 * @param seriesId - The unique ID of the series in Sonarr.
 * @param seasonNumber - The specific season number to search (optional, null for all seasons).
 * @param sonarrUrl - Sonarr API URL.
 * @param sonarrApiKey - Sonarr API key.
 */
export async function searchSeriesInSonarr(
    seriesId: number,
    seasonNumber: number | null,
    sonarrUrl: string,
    sonarrApiKey: string
): Promise<void> {
    try {
        // Prepare the payload with correct types
        const payload: Record<string, any> = {
            name: "SeasonSearch",
            seriesId,
        };

        // Only include seasonNumber if it's not null, ensuring it's a number
        if (seasonNumber !== null) {
            payload.seasonNumber =  Number(seasonNumber);
        }

        console.log("🔍 Sending SeasonSearch payload to Sonarr:", JSON.stringify(payload, null, 2));

        // Send the API request
        const response = await axios.post(`${sonarrUrl}/command`, payload, {
            headers: { "X-Api-Key": sonarrApiKey },
        });

        console.log(`✅ Search started successfully for series ID ${seriesId}, season ${seasonNumber || "all"}.`);
        console.log("Response:", response.data);
    } catch (error: any) {
        console.error(`❌ Error searching for series in Sonarr: ${error.message}`);
        throw error;
    }
}