import path from "path";
import { config } from "../config";
import { getMovieIdsByTag, getMovieStatus, getTagId } from "../systems/radarr";
import { cleanUpDummyFile, createDummyFile, ensureDirectoryExists, removeDummyFolder } from "../utils";

/**
 * Main function for movie maintenance.
 * Ensures dummy files are created for movies not downloaded and cleans up dummy files for downloaded movies.
 */
export async function movieMaintenance() {
    const radarrUrl = config.RADARR_URL;
    const radarrApiKey = config.RADARR_API_KEY;
    const dummyTagName = config.RADARR_MONITOR_TAG_NAME;
    const dummySource = config.DUMMY_FILE_LOCATION;
    const dummyBaseFolder = config.MOVIE_FOLDER_DUMMY;

    try {
        // Fetch the tag ID for the dummy tag
        const tagId = await getTagId(dummyTagName, radarrUrl, radarrApiKey);
        if (!tagId) {
            console.error(`❌ Tag "${dummyTagName}" not found in Radarr. Exiting.`);
            return;
        }

        // Get movie IDs associated with the dummy tag
        const movieIds = await getMovieIdsByTag(tagId, radarrUrl, radarrApiKey);

        console.log(`✅ Found ${movieIds.length} movies with the "${dummyTagName}" tag.`);

        for (const movieId of movieIds) {
            const movieStatus = await getMovieStatus(movieId);

            if (movieStatus) {
                const movieFolder = movieStatus.path;
                const dummyFolder = path.join(dummyBaseFolder, path.basename(movieFolder));
                const dummyFile = path.join(movieFolder, "dummy.mp4");

                if (movieStatus.hasFile) {
                    console.log(`🎬 Movie "${movieStatus.title}" is downloaded. Cleaning up dummy files.`);
                    // Clean up dummy files for downloaded movies
                    await cleanUpDummyFile(movieFolder);
                    await removeDummyFolder(dummyFolder);
                } else {
                    console.log(`🎬 Movie "${movieStatus.title}" is not downloaded. Ensuring dummy file exists.`);
                    // Ensure dummy file exists for not downloaded movies
                    await ensureDirectoryExists(movieFolder);
                    await ensureDirectoryExists(dummyFolder);
                    await createDummyFile(dummySource, dummyFile);

                    // For now you have to do a manually library scan.

                    // movieFolder = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder)); // Temporary because my Plex has a different path
                    // await notifyPlexFolderRefresh(movieFolder);

                }
            } else {
                console.log(`❌ Unable to retrieve status for movie ID ${movieId}.`);
            }
        }

        console.log(`✅ Daily maintenance completed for ${movieIds.length} movies.`);
    } catch (error: any) {
        console.error(`❌ Error during daily movie maintenance: ${error.message}`);
    }
}

movieMaintenance();