import express, { Request, Response } from "express";
import axios from "axios";
import path from "path";
import dotenv from "dotenv";
import { addMovieToRadarr, addTagForMovie, checkMovieInRadarr, getMovieStatus, getTagId, isMovieDownloading, searchMovieInRadarr } from "./systems/radarr";
import { config } from "./config";
import { notifyPlexFolderRefresh, updatePlexDescription } from "./systems/plex";
import { cleanUpDummyFile, createDummyFile, createSymlink, ensureDirectoryExists, removeDummyFolder } from "./utils";
import { terminateStreamByFile } from "./systems/tautulli";

const app = express();
const PORT = 3000;

dotenv.config();

app.use(express.json());

// Function to check movie status every 5 seconds
async function monitorAvailability(movieId: number, ratingKey: string, originalFilePath: string, movieDescription: string) {
    console.log("🔵 Monitoring availability for the next 5 minutes...");

    const maxRetries = 60;
    let attempts = 0;

    return new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            attempts++;

            let requestStatus = `Checking availability for movie (attempt ${attempts}/${maxRetries})...`;

            console.log(`🟡 Checking availability (attempt ${attempts}/${maxRetries})...`);

            const movie = await getMovieStatus(movieId);

            const downloading = await isMovieDownloading(movieId);

            if (downloading) {
                console.log(`⏳ Movie ID ${movieId} is currently downloading. Waiting for completion...`);
                requestStatus = `Movie is currently downloading. Waiting for completion...`;
            }

            // await checkFailedSearches(movieId); // Check for failed searches TEST

            if (movie) {
                // Check if the file is a dummy
                if (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4") {
                    console.log("❌ Dummy file detected, ignoring availability and continuing search.");
                    //await searchMovieInRadarr(movieId); // Force a search
                } else if (movie.hasFile) {
                    console.log(`🎉 Movie "${movie.title}" is now available!`);

                    // Terminate the stream for the file
                    if (originalFilePath) {
                        await terminateStreamByFile(originalFilePath);
                    }

                    clearInterval(interval);
                    resolve();
                } else {
                    await updatePlexDescription(ratingKey, movieDescription, requestStatus);
                }
            }

            if (attempts >= maxRetries) {
                console.log("⏰ Time limit exceeded. The movie is not available yet.");

                // Determine if a torrent has been downloaded; is the movie actually available? We might know this sooner.

                clearInterval(interval);
                resolve();
            }
        }, 5000); // Check every 5 seconds
    });
}

const activeRequests = new Set<string>(); // Track active movie requests

// Route for the Tautulli webhook
app.post("/webhook", async (req: Request, res: Response, next: express.NextFunction): Promise<void> => {
    try {
        const event = req.body;

        console.log("📩 Event received:", event);

        // Check if it is a playback.start event
        if (event && event.event === "playback.start") {
            console.log("▶️ Playback started!");
            console.log("📋 Event details:", JSON.stringify(event, null, 2));

            if (event.media_type === "movie") {
                const imdbId = event.imdb_id;
                const ratingKey = event.rating_key;

                if (!ratingKey) {
                    console.log("⚠️ No ratingKey received in the request.");
                    res.status(400).send("Invalid request: missing ratingKey.");
                }

                // Check if there is already a request for this ratingKey
                if (activeRequests.has(ratingKey)) {
                    console.log(`🔁 Request for movie with ratingKey ${ratingKey} is already active.`);
                    res.status(200).send("Request already in progress.");
                }

                // Add ratingKey to the set
                activeRequests.add(ratingKey);

                try {
                    if (imdbId) {
                        console.log(`🎬 IMDb ID received: ${imdbId}`);

                        // Retrieve movie details from Radarr
                        const response = await axios.get(`${config.RADARR_URL}/movie`, {
                            headers: { "X-Api-Key": config.RADARR_API_KEY },
                        });

                        const movie = response.data.find((m: any) => m.imdbId === imdbId);

                        if (movie) {
                            console.log("✅ Movie found in Radarr:");
                            console.log(JSON.stringify(movie, null, 2));

                            const originalFilePath = event.file;

                            // Check availability
                            if (!movie.hasFile || (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4")) {
                                console.log("❌ Dummy file detected or movie not available. Initiating search...");
                                const movieDescription = movie.overview;

                                let requestStatus = "The movie is being requested. Please wait a few moments while it becomes available.";
                                updatePlexDescription(ratingKey, movieDescription, requestStatus);

                                searchMovieInRadarr(movie.id, config.RADARR_URL, config.RADARR_API_KEY);

                                // Start monitoring for availability
                                await monitorAvailability(movie.id, ratingKey, originalFilePath, movieDescription);
                            } else {
                                console.log(`🎉 Movie "${movie.title}" is already available!`);
                            }
                        } else {
                            console.log("❌ Movie not found in Radarr.");
                        }
                    } else {
                        console.log("⚠️ No IMDb ID received in the request.");
                    }
                } catch (error: any) {
                    console.error(`❌ Error processing the request: ${error.message}`);
                } finally {
                    // Remove ratingKey from the set after completion
                    activeRequests.delete(ratingKey);
                    console.log(`✅ Request for movie with ratingKey ${ratingKey} completed.`);
                }
            } else if (event.media_type === "episode") {
                console.log("📺 Playback action detected for an episode.");
            }
        } else {
            console.log("⚠️ Received event is not playback.start:", event.event);
        }

        res.status(200).send("Webhook received.");
    } catch (error) {
        console.error("❌ Error processing the webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/radarr-webhook", async (req: Request, res: Response) => {
    const event = req.body;

    console.log("📩 Radarr Webhook received:", event);

    // Check if it is an event for a new movie
    if (event && event.eventType === "MovieAdded" && event.movie && event.movie.folderPath) {
        let movieFolder = event.movie.folderPath;
        const movieFolderDummy = path.join(config.MOVIE_FOLDER_DUMMY, path.basename(movieFolder));
        const movieFolderPlex = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder));

        const dummySource = config.DUMMY_FILE_LOCATION; // Path to the dummy file
        const dummyLink = path.join(movieFolderDummy, "dummy.mp4"); // Symlink target

        const plexLink = path.join(movieFolderPlex, "dummy.mp4"); // Symlink target

        console.log(`🎬 New movie added with dummy tag. Folder: ${movieFolderDummy}`);

        try {
            // Ensure the directory exists
            await ensureDirectoryExists(movieFolderDummy);
            await ensureDirectoryExists(movieFolder);

            // Create dummy file
            await createDummyFile(dummySource, dummyLink);

            // Create the symlink
            await createSymlink(dummyLink, plexLink);

            movieFolder = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder)); // Temporary because my Plex has a different path
            await notifyPlexFolderRefresh(movieFolder);

            res.status(200).send("Symlink created and Plex folder notified successfully.");
        } catch (error) {
            res.status(500).send("Error while processing the webhook.");
        }
    } else if (event && event.eventType === "Download" && event.movie && event.movie.folderPath) {
        console.log(event);
        let movieFolder = event.movie.folderPath;
        const imdbId = event.movie.imdbId;
        const tmdbId = event.movie.tmdbId;

        const movieFolderDummy = path.join(config.MOVIE_FOLDER_DUMMY, path.basename(movieFolder));

        console.log(`🎬 File imported for movie: ${event.movie.title} (${event.movie.year}). Folder: ${movieFolder}`);

        // Call the function to clean up dummy.mp4
        await cleanUpDummyFile(movieFolder);
        await removeDummyFolder(movieFolderDummy);

        // Add movie to 4K Radarr instance if configured
        if (config.RADARR_4K_URL) {
            (async () => {
                try {
                    const [exists, movieDetails] = await checkMovieInRadarr(tmdbId, config.RADARR_4K_URL, config.RADARR_4K_API_KEY);

                    if (exists) {
                        if (!movieDetails.hasFile || (movieDetails.movieFile && movieDetails.movieFile.relativePath === "dummy.mp4")) {
                            // Movie not available in 4K instance yet
                            await searchMovieInRadarr(movieDetails.id, config.RADARR_4K_URL, config.RADARR_4K_API_KEY);
                        }

                        console.log(`✅ Movie already exists in Radarr: ${movieDetails.title}`);
                    } else {
                        console.log(`❌ Movie not found in Radarr. Adding...`);

                        // Add the movie with default parameters
                        const newMovie = await addMovieToRadarr(tmdbId, config.RADARR_4K_MOVIE_FOLDER, Number(config.RADARR_4K_QUALITY_PROFILE_ID), true, true, config.RADARR_4K_URL, config.RADARR_4K_API_KEY, ["infiniteplexlibrary"]);

                        console.log(`🎥 Movie added to Radarr 4K: ${newMovie.title}`);
                    }
                } catch (error: any) {
                    console.error(`❌ Error processing the movie: ${error.message}`);
                }
            })();
        }

        // Notify Plex folder refresh
        movieFolder = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder)); // Temporary because my Plex has a different path
        await notifyPlexFolderRefresh(movieFolder);

        res.status(200).send("File import processed successfully.");
    } else {
        console.log("⚠️ No valid event received.");
        res.status(200).send("Invalid event.");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server is listening on port ${PORT}`);
});