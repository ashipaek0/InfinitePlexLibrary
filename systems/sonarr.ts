import axios from "axios";
import { config } from "../config";
import { createDummyFile, ensureDirectoryExists } from "../utils";

/**
 * Fetches all episodes of a series by its series ID from Sonarr.
 * @param seriesId - The ID of the series in Sonarr.
 * @returns Array of episodes belonging to the series.
 */
export async function getEpisodesBySeriesId(seriesId: number): Promise<any[]> {
    try {
        const { data: episodes } = await axios.get(`${config.SONARR_URL}/episode`, {
            params: { seriesId },
            headers: { "X-Api-Key": config.SONARR_API_KEY },
        });

        console.log(`✅ Retrieved ${episodes.length} episodes for series ID ${seriesId}.`);
        return episodes;
    } catch (error: any) {
        console.error(`❌ Error fetching episodes for series ID ${seriesId}:`, error.message);
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
