import axios from "axios";
import { config } from "../config";

/**
 * Fetches all movie IDs associated with a specific tag from Radarr.
 * @param tagId - The ID of the tag.
 * @param radarrUrl - The Radarr API URL.
 * @param radarrApiKey - The Radarr API key.
 * @returns An array of movie IDs associated with the tag.
 */
export async function getMovieIdsByTag(
    tagId: number,
    radarrUrl: string,
    radarrApiKey: string
): Promise<number[]> {
    try {
        // Fetch tag details from Radarr
        const { data: tagDetail } = await axios.get(`${radarrUrl}/tag/detail/${tagId}`, {
            headers: { "X-Api-Key": radarrApiKey },
        });

        if (tagDetail && tagDetail.movieIds) {
            //console.log(`✅ Found ${tagDetail.movieIds.length} movies with tag ID ${tagId}.`);
            return tagDetail.movieIds;
        }

        console.log(`❌ No movies found for tag ID ${tagId}.`);
        return [];
    } catch (error: any) {
        console.error(`❌ Error fetching movies by tag ID ${tagId}: ${error.message}`);
        throw error;
    }
}


/**
 * Checks if a movie exists in Radarr and returns the details if available.
 * @param tmdbId - TMDb ID of the movie.
 * @param radarrUrl - Radarr API URL.
 * @param radarrApiKey - Radarr API key.
 * @returns Tuple with a boolean and the movie details (or null).
 */
export async function checkMovieInRadarr(tmdbId: string, radarrUrl: string, radarrApiKey: string): Promise<[boolean, any | null]> {
    try {
        // Fetch the movie via Radarr API
        const response = await axios.get(`${radarrUrl}/movie?tmdbId=${tmdbId}`, {
            headers: { "X-Api-Key": radarrApiKey },
        });

        // Radarr returns an array, check if it is empty
        const movies = response.data;

        if (movies.length > 0) {
            const movie = movies[0]; // Take the first movie from the results
            console.log(`✅ Movie found in Radarr: ${movie.title}`);
            return [true, movie];
        } else {
            console.log(`❌ Movie not found in Radarr for TMDb ID: ${tmdbId}`);
            return [false, null];
        }
    } catch (error: any) {
        console.error(`❌ Error fetching movies from Radarr: ${error.message}`);
        return [false, null];
    }
}

/**
 * Adds a movie to Radarr.
 * @param tmdbId - The TMDb ID of the movie.
 * @param rootFolderPath - The path where the movie should be stored.
 * @param qualityProfileId - The ID of the quality profile.
 * @param monitored - Whether the movie should be monitored (default: false).
 * @param searchForMovie - Whether to search for the movie immediately (default: false).
 * @param radarrUrl - Radarr URL
 * @param radarrApiKey - Radarr API key
 * @param tags - Optional: An array of tags (e.g., ["action", "4k"]).
 * @returns An object with details of the added movie.
 */
export async function addMovieToRadarr(
    tmdbId: string,
    rootFolderPath: string,
    qualityProfileId: number,
    monitored: boolean = false,
    searchForMovie: boolean = false,
    radarrUrl: string, 
    radarrApiKey: string,
    tags?: string[]
): Promise<any> {
    try {
        let tagIds: number[] = [];
        if (tags && tags.length > 0) {

            // Fetch the available tags from Radarr
            const { data: availableTags } = await axios.get(`${radarrUrl}/tag`, {
                headers: { "X-Api-Key": radarrApiKey },
            });

            // Find IDs for the provided tag names
            tagIds = tags.map((tag) => {
                const tagEntry = availableTags.find((t: any) => t.label.toLowerCase() === tag.toLowerCase());
                if (tagEntry) {
                    return tagEntry.id;
                } else {
                    console.warn(`⚠️ Tag not found: ${tag}`);
                    return null;
                }
            }).filter((id): id is number => id !== null);
        }

        // Add movie
        const newMovie = {
            tmdbId,
            rootFolderPath,
            qualityProfileId,
            monitored,
            tags: tagIds,
            addOptions: {
                searchForMovie,
            },
        };

        const addResponse = await axios.post(`${radarrUrl}/movie`, newMovie, {
            headers: { "X-Api-Key": radarrApiKey },
        });

        console.log(`🎥 Movie successfully added to Radarr: ${addResponse.data.title}`);
        return addResponse.data;
    } catch (error: any) {
        console.error(`❌ Error adding movie to Radarr: ${error.message}`);
        throw error;
    }
}

/**
 * Sets a movie to monitored and starts a search in Radarr.
 * @param movieId - The unique ID of the movie in Radarr.
 * @param radarrUrl - Radarr URL
 * @param radarrApiKey - Radarr API key
 */
export async function searchMovieInRadarr(movieId: number, radarrUrl: string, radarrApiKey: string): Promise<void> {
    try {
        // Fetch the movie data from Radarr
        const { data: movie } = await axios.get(`${radarrUrl}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": radarrApiKey,
            },
        });

        // Check if the movie is already monitored
        if (!movie.monitored) {
            console.log(`🔄 Setting movie "${movie.title}" to monitored...`);

            // Set the movie to "monitored"
            const updatedMovie = { ...movie, monitored: true };

            // Send the update to Radarr
            await axios.put(`${radarrUrl}/movie`, updatedMovie, {
                headers: {
                    "X-Api-Key": radarrApiKey,
                },
            });

            console.log(`🎬 Movie "${movie.title}" is now monitored.`);
        } else {
            console.log(`✅ Movie "${movie.title}" is already monitored.`);
        }

        // Start a search for the movie
        console.log(`🔍 Starting search for movie "${movie.title}"...`);
        await axios.post(
            `${radarrUrl}/command`,
            { name: "MoviesSearch", movieIds: [movieId] },
            {
                headers: {
                    "X-Api-Key": radarrApiKey,
                },
            }
        );

        console.log(`✅ Search started for movie "${movie.title}" (ID: ${movieId}).`);
    } catch (error: any) {
        console.error(`❌ Error searching for movie in Radarr: ${error.message}`);
    }
}

export async function isMovieDownloading(movieId: number): Promise<boolean> {
    try {
        console.log(`🔍 Checking if movie ID ${movieId} is in the download queue...`);
        const response = await axios.get(`${config.RADARR_URL}/queue`, {
            headers: {
                "X-Api-Key": config.RADARR_API_KEY,
            },
        });

        const queue = response.data.records;

        // Search for the movie in the queue
        const downloadingMovie = queue.find((item: any) => item.movieId === movieId);

        if (downloadingMovie) {
            console.log(
                `🚀 Movie "${downloadingMovie.title}" is currently downloading. Progress: ${downloadingMovie.sizeleft} bytes left.`
            );
            return true;
        }

        console.log(`ℹ️ Movie ID ${movieId} is not in the download queue.`);
        return false;
    } catch (error: any) {
        console.error("❌ Error checking Radarr download queue:", error.message);
        return false;
    }
}


export async function getMovieStatus(movieId: number) {
    try {
        const { data: movie } = await axios.get(`${config.RADARR_URL}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": config.RADARR_API_KEY,
            },
        });
        return movie;
    } catch (error: any) {
        console.error("Error fetching movie status from Radarr:", error.message);
        return null;
    }
}


/**
 * Adds a tag to an existing movie in Radarr.
 * @param movieId - The unique ID of the movie in Radarr.
 * @param tagId - The unique ID of the tag in Radarr.
 * @param radarrUrl - The Radarr API URL.
 * @param radarrApiKey - The Radarr API key.
 */
export async function addTagForMovie(movieId: number, tagId: number, radarrUrl: string, radarrApiKey: string): Promise<void> {
    try {
        // Fetch the current movie data
        const { data: movie } = await axios.get(`${radarrUrl}/movie/${movieId}`, {
            headers: { "X-Api-Key": radarrApiKey },
        });

        // Check if the tag already exists for the movie
        if (movie.tags && movie.tags.includes(tagId)) {
            console.log(`🏷️ Tag ${tagId} already exists for movie "${movie.title}".`);
            return;
        }

        // Add the new tag to the existing list of tags
        const updatedTags = movie.tags ? [...movie.tags, tagId] : [tagId];

        // Update the movie with the new tags
        const updatedMovie = { ...movie, tags: updatedTags };

        await axios.put(`${radarrUrl}/movie`, updatedMovie, {
            headers: { "X-Api-Key": radarrApiKey },
        });

        console.log(`✅ Tag ${tagId} successfully added to movie "${movie.title}".`);
    } catch (error: any) {
        console.error(`❌ Error adding tag ${tagId} to movie ID ${movieId}: ${error.message}`);
        throw error;
    }
}

export async function getTagId(tagName: string, radarrUrl: string, radarrApiKey: string): Promise<number | null> {
    try {
        const { data: tags } = await axios.get(`${radarrUrl}/tag`, {
            headers: {
                "X-Api-Key": radarrApiKey,
            },
        });

        const tag = tags.find((t: any) => t.label === tagName);
        return tag ? tag.id : null;
    } catch (error: any) {
        console.error("❌ Error fetching tags from Radarr:", error.message);
        return null;
    }
}

/// check

export async function removeTagFromMovie(movieId: number, tagId: number) {
    try {
        const { data: movie } = await axios.get(`${config.RADARR_URL}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": config.RADARR_API_KEY,
            },
        });

        // Filter the tag out of the tag list
        const updatedTags = movie.tags.filter((id: number) => id !== tagId);

        // Update the movie with the modified tags
        const updatedMovie = { ...movie, tags: updatedTags };
        await axios.put(`${config.RADARR_URL}/movie`, updatedMovie, {
            headers: {
                "X-Api-Key": config.RADARR_API_KEY,
            },
        });

        console.log(`🏷️ Successfully removed tag ID ${tagId} from movie ID ${movieId}.`);
    } catch (error: any) {
        console.error("❌ Error removing tag from movie:", error.message);
    }
}
