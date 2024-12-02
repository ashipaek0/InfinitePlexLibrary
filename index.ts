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

// Functie om elke 5 seconden de filmstatus te controleren
async function monitorAvailability(movieId: number, ratingKey: string, originalFilePath: string, movieDescription: string) {
    console.log("🔵 Monitoring availability for the next 5 minutes...");

    const maxRetries = 60;
    let attempts = 0;

    return new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            attempts++;

            var requestStatus = `Checking availability for movie (attempt ${attempts}/${maxRetries})...`

            console.log(`🟡 Checking availability (attempt ${attempts}/${maxRetries})...`);

            const movie = await getMovieStatus(movieId);

            const downloading = await isMovieDownloading(movieId);

            if (downloading) {
                console.log(`⏳ Movie ID ${movieId} is currently downloading. Waiting for completion...`);
                requestStatus = `Movie is currently downloading. Waiting for completion...`
            }

            //  await checkFailedSearches(movieId); // Controleer op mislukte zoekpogingen TEST

            if (movie) {
                // Controleer of het bestand een dummy is
                if (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4") {
                    console.log("❌ Dummy file detected, ignoring availability and continuing search.");
                    //await searchMovieInRadarr(movieId); // Forceer een zoekopdracht
                } else if (movie.hasFile) {
                    console.log(`🎉 Movie "${movie.title}" is now available!`);

                    // Beëindig de stream voor het bestand
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

                // Uitzoeken of er wel een torrent gedownload is; of de film wel beschikbaar is? Dit weten we mogelijk ook al eerder.

                clearInterval(interval);
                resolve();
            }
        }, 5000); // Controleer elke 10 seconden
    });
}

const activeRequests = new Set<string>(); // Houd actieve filmverzoeken bij

// Route voor de Tautulli webhook
app.post("/webhook", async (req: Request, res: Response, next: express.NextFunction): Promise<void> => {


    try {
        const event = req.body;

        console.log("📩 Event ontvangen:", event);

        // Controleer of het een playback.start event is
        if (event && event.event === "playback.start") {
            console.log("▶️ Playback gestart!");
            console.log("📋 Event details:", JSON.stringify(event, null, 2));

            if (event.media_type === "movie") {
                const imdbId = event.imdb_id;
                const ratingKey = event.rating_key;

                if (!ratingKey) {
                    console.log("⚠️ Geen ratingKey ontvangen in het verzoek.");
                    res.status(400).send("Invalid request: missing ratingKey.");
                }

                // Controleer of er al een verzoek loopt voor deze ratingKey
                if (activeRequests.has(ratingKey)) {
                    console.log(`🔁 Verzoek voor film met ratingKey ${ratingKey} is al actief.`);
                    res.status(200).send("Request already in progress.");
                }

                // Voeg ratingKey toe aan de set
                activeRequests.add(ratingKey);

                try {
                    if (imdbId) {
                        console.log(`🎬 IMDb ID ontvangen: ${imdbId}`);

                        // Vraag de filmgegevens op bij Radarr
                        const response = await axios.get(`${config.RADARR_URL}/movie`, {
                            headers: { "X-Api-Key": config.RADARR_API_KEY },
                        });

                        const movie = response.data.find((m: any) => m.imdbId === imdbId);

                        if (movie) {
                            console.log("✅ Film gevonden in Radarr:");
                            console.log(JSON.stringify(movie, null, 2));

                            const originalFilePath = event.file;

                            // Controleer beschikbaarheid
                            if (!movie.hasFile || (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4")) {
                                console.log("❌ Dummy file detected or movie not available. Initiating search...");
                                const movieDescription = movie.overview;

                                var requestStatus = "The movie is being requested. Please wait a few moments while it becomes available.";
                                updatePlexDescription(ratingKey, movieDescription, requestStatus);

                                searchMovieInRadarr(movie.id, config.RADARR_URL, config.RADARR_API_KEY);

                                // Start monitoring voor beschikbaarheid
                                await monitorAvailability(movie.id, ratingKey, originalFilePath, movieDescription);
                            } else {
                                console.log(`🎉 Movie "${movie.title}" is already available!`);
                            }
                        } else {
                            console.log("❌ Film niet gevonden in Radarr.");
                        }
                    } else {
                        console.log("⚠️ Geen IMDb ID ontvangen in het verzoek.");
                    }
                } catch (error: any) {
                    console.error(`❌ Fout bij het verwerken van het verzoek: ${error.message}`);
                } finally {
                    // Verwijder ratingKey uit de set na voltooiing
                    activeRequests.delete(ratingKey);
                    console.log(`✅ Verzoek voor film met ratingKey ${ratingKey} voltooid.`);
                }
            } else if (event.media_type === "episode") {
                console.log("📺 Afspeelactie voor een aflevering gedetecteerd.");
            }
        } else {
            console.log("⚠️ Ontvangen event is geen playback.start:", event.event);
        }

        res.status(200).send("Webhook ontvangen.");

    } catch (error) {
        console.error("❌ Fout bij het verwerken van de webhook:", error);
        res.status(500).send("Internal Server Error");
    }
});


app.post("/radarr-webhook", async (req: Request, res: Response) => {
    const event = req.body;

    console.log("📩 Radarr Webhook ontvangen:", event);

    // Controleer of het een evenement is voor een nieuwe film
    if (event && event.eventType === "MovieAdded" && event.movie && event.movie.folderPath) {
        //const movieFolder = event.movie.folderPath.replace("/plex/", "/media/");; // De folderlocatie van de film
        var movieFolder = event.movie.folderPath;
        const movieFolderDummy = path.join(config.MOVIE_FOLDER_DUMMY, path.basename(movieFolder));
        const movieFolderPlex = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder));

        const dummySource = config.DUMMY_FILE_LOCATION; // Pad naar het dummy-bestand
        const dummyLink = path.join(movieFolderDummy, "dummy.mp4"); // Doel van de symlink

        const plexLink = path.join(movieFolderPlex, "dummy.mp4"); // Doel van de symlink

        console.log(`🎬 Nieuwe film toegevoegd met dummy tag. Folder: ${movieFolderDummy}`);

        try {
            // Zorg dat de map bestaat
            await ensureDirectoryExists(movieFolderDummy);
            await ensureDirectoryExists(movieFolder);

            // Maak dummy file
            await createDummyFile(dummySource, dummyLink);

            // Maak de symlink
            await createSymlink(dummyLink, plexLink);

            movieFolder = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder)); // temporary because my plex has a different path
            await notifyPlexFolderRefresh(movieFolder);

            res.status(200).send("Symlink created and Plex folder notified successfully.");

        } catch (error) {
            res.status(500).send("Error while processing the webhook.");
        }
    } else if (event && event.eventType === "Download" && event.movie && event.movie.folderPath) {
        console.log(event);
        var movieFolder = event.movie.folderPath;
        const imdbId = event.movie.imdbId;
        const tmdbId = event.movie.tmdbId;

        const movieFolderDummy = path.join(config.MOVIE_FOLDER_DUMMY, path.basename(movieFolder));

        console.log(`🎬 Bestand geïmporteerd voor film: ${event.movie.title} (${event.movie.year}). Map: ${movieFolder}`);

        // Roep de functie aan om dummy.mp4 op te ruimen
        await cleanUpDummyFile(movieFolder);
        await removeDummyFolder(movieFolderDummy);

        // Add movie to 4K Radarr instance

        if (config.RADARR_4K_URL) {

            (async () => {
                try {
                    const [exists, movieDetails] = await checkMovieInRadarr(tmdbId, config.RADARR_4K_URL, config.RADARR_4K_API_KEY);

                    if (exists) {

                        if (!movieDetails.hasFile || (movieDetails.movieFile && movieDetails.movieFile.relativePath === "dummy.mp4")) { // Movie not available in 4k instance yet

                            await searchMovieInRadarr(movieDetails.id, config.RADARR_4K_URL, config.RADARR_4K_API_KEY);

                        }

                        console.log(`✅ Film bestaat al in Radarr: ${movieDetails.title}`);
                    } else {
                        console.log(`❌ Film niet gevonden in Radarr. Toevoegen...`);

                        // Voeg de film toe met standaard parameters
                        const newMovie = await addMovieToRadarr(tmdbId, config.RADARR_4K_MOVIE_FOLDER, Number(config.RADARR_4K_QUALITY_PROFILE_ID), true, true, config.RADARR_4K_URL, config.RADARR_4K_API_KEY, ["infiniteplexlibrary"]);

                        console.log(`🎥 Film toegevoegd aan Radarr 4K: ${newMovie.title}`);
                    }
                } catch (error: any) {
                    console.error(`❌ Fout bij het verwerken van de film: ${error.message}`);
                }
            })();

        }

        // end

        movieFolder = path.join(config.PLEX_MOVIE_FOLDER, path.basename(movieFolder)); // temporary because my plex has a different path
        await notifyPlexFolderRefresh(movieFolder);

        res.status(200).send("File import processed successfully.");
    } else {
        console.log("⚠️ Geen geldig event ontvangen.");
        res.status(200).send("Invalid event.");
    }
});

// Nieuwe webhook als movie is gedownload; controleren of er een dummy.mp4 in de folder zit en deze verwijderen. Dit moet die ook periodiek gaan checken.

// Start de server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server luistert op poort ${PORT}`);
});