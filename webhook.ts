import express, { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;

// Radarr API configuratie
const RADARR_URL = "http://192.168.1.237:7878/api/v3"; // Vervang met je Radarr URL
const RADARR_API_KEY = "9aae26381a0e41a4ab07248d105ca551"; // Vervang met je Radarr API key

const TAUTULLI_URL = "http://192.168.1.237:8181/api/v2"; // Vervang door je Tautulli URL
const TAUTULLI_API_KEY = "5f04ab624be84fd794ddad7a07245599"; // Vervang door je Tautulli API key


app.use(express.json());

async function createSymlink(targetPath: string, linkPath: string): Promise<void> {
    try {
        // Controleer of het doelbestand bestaat
        if (!fs.existsSync(targetPath)) {
            throw new Error(`Target file does not exist: ${targetPath}`);
        }

        // Controleer of er al een symlink of bestand op de linklocatie bestaat
        if (fs.existsSync(linkPath)) {
            console.log(`🟡 Symlink or file already exists at: ${linkPath}`);
            return;
        }

        // Maak de symlink
        fs.symlinkSync(targetPath, linkPath);
        console.log(`✅ Symlink created: ${linkPath} -> ${targetPath}`);
    } catch (error: any) {
        console.error(`❌ Error creating symlink: ${error.message}`);
    }
}

async function terminateStreamByFile(originalFilePath: string) {
    try {
        // Haal alle actieve sessies op uit Tautulli
        const { data } = await axios.get(`${TAUTULLI_URL}`, {
            params: {
                cmd: "get_activity",
                apikey: TAUTULLI_API_KEY,
            },
        });

        if (data && data.response && data.response.data && data.response.data.sessions) {
            const sessions = data.response.data.sessions;

            // Zoek naar een sessie met het opgegeven originele bestandspad
            const session = sessions.find((s: any) => s.file === originalFilePath);

            if (session) {
                console.log(`🎬 Actieve stream gevonden: Session ID ${session.session_id}, File: ${originalFilePath}`);

                // Beëindig de sessie
                await axios.get(`${TAUTULLI_URL}`, {
                    params: {
                        cmd: "terminate_session",
                        apikey: TAUTULLI_API_KEY,
                        session_id: session.session_id,
                        message: "Stream terminated because the movie is now available in higher quality.",
                    },
                });

                console.log(`✅ Stream beëindigd voor bestand: ${originalFilePath}`);
            } else {
                console.log(`❌ Geen actieve stream gevonden voor bestand: ${originalFilePath}`);
            }
        } else {
            console.log("❌ Geen actieve sessies gevonden.");
        }
    } catch (error: any) {
        console.error("❌ Error while terminating stream:", error.message);
    }
}


async function searchMovieInRadarr(movieId: number) {
    try {
        // Haal de filmgegevens op uit Radarr
        const { data: movie } = await axios.get(`${RADARR_URL}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": RADARR_API_KEY,
            },
        });

        // Controleer of de film al gemonitord is
        if (!movie.monitored) {
            // Zet de film op "monitored"
            const updatedMovie = { ...movie, monitored: true };

            // Stuur de update naar Radarr
            await axios.put(`${RADARR_URL}/movie`, updatedMovie, {
                headers: {
                    "X-Api-Key": RADARR_API_KEY,
                },
            });

            console.log(`🎬 Movie "${movie.title}" is now monitored.`);
        }

        // Start een zoekopdracht voor de film
        await axios.post(
            `${RADARR_URL}/command`,
            { name: "MoviesSearch", movieIds: [movieId] },
            {
                headers: {
                    "X-Api-Key": RADARR_API_KEY,
                },
            }
        );

        console.log(`🔍 Zoekopdracht gestart voor film ID: ${movieId}`);
    } catch (error: any) {
        console.error("❌ Error searching for movie in Radarr:", error.message);
    }
}

async function getTagId(tagName: string): Promise<number | null> {
    try {
        const { data: tags } = await axios.get(`${RADARR_URL}/tag`, {
            headers: {
                "X-Api-Key": RADARR_API_KEY,
            },
        });

        const tag = tags.find((t: any) => t.label === tagName);
        return tag ? tag.id : null;
    } catch (error: any) {
        console.error("❌ Error fetching tags from Radarr:", error.message);
        return null;
    }
}

async function removeTagFromMovie(movieId: number, tagId: number) {
    try {
        const { data: movie } = await axios.get(`${RADARR_URL}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": RADARR_API_KEY,
            },
        });

        // Filter de tag uit de taglijst
        const updatedTags = movie.tags.filter((id: number) => id !== tagId);

        // Update de film met de gewijzigde tags
        const updatedMovie = { ...movie, tags: updatedTags };
        await axios.put(`${RADARR_URL}/movie`, updatedMovie, {
            headers: {
                "X-Api-Key": RADARR_API_KEY,
            },
        });

        console.log(`🏷️ Successfully removed tag ID ${tagId} from movie ID ${movieId}.`);
    } catch (error: any) {
        console.error("❌ Error removing tag from movie:", error.message);
    }
}


// Functie om een filmstatus in Radarr op te halen
async function getMovieStatus(movieId: number) {
    try {
        const { data: movie } = await axios.get(`${RADARR_URL}/movie/${movieId}`, {
            headers: {
                "X-Api-Key": RADARR_API_KEY,
            },
        });
        return movie;
    } catch (error: any) {
        console.error("Error fetching movie status from Radarr:", error.message);
        return null;
    }
}

// Functie om elke 15 seconden de filmstatus te controleren
async function monitorAvailability(movieId: number, originalFilePath: string) {
    console.log("🔵 Monitoring availability for the next 5 minutes...");

    const maxRetries = 20; // 5 minuten bij 15 seconden interval
    let attempts = 0;

    return new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            attempts++;
            console.log(`🟡 Checking availability (attempt ${attempts}/${maxRetries})...`);

            const movie = await getMovieStatus(movieId);

            if (movie) {
                // Controleer of het bestand een dummy is
                if (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4") {
                    console.log("❌ Dummy file detected, ignoring availability and continuing search.");
                    await searchMovieInRadarr(movieId); // Forceer een zoekopdracht
                } else if (movie.hasFile) {
                    console.log(`🎉 Movie "${movie.title}" is now available!`);

                    // Verwijder de 'dummy' tag als deze bestaat
                    if (movie.tags && movie.tags.length > 0) {
                        console.log("🏷️ Checking tags...");
                        const dummyTagId = await getTagId("dummy");

                        if (dummyTagId && movie.tags.includes(dummyTagId)) {
                            await removeTagFromMovie(movieId, dummyTagId);
                            console.log(`🏷️ Removed 'dummy' tag from movie "${movie.title}".`);
                        }
                    }

                    // Beëindig de stream voor het bestand
                    if (originalFilePath) {
                        await terminateStreamByFile(originalFilePath);
                    }

                    clearInterval(interval);
                    resolve();
                }
            }

            if (attempts >= maxRetries) {
                console.log("⏰ Time limit exceeded. The movie is not available yet.");
                clearInterval(interval);
                resolve();
            }
        }, 15000); // Controleer elke 15 seconden
    });
}

// Route voor de Tautulli webhook
app.post("/webhook", async (req: Request, res: Response) => {
    const event = req.body;

    console.log("📩 Event ontvangen:", event);

    // Controleer of het een playback.start event is
    if (event && event.event === "playback.start") {
        console.log("▶️ Playback gestart!");
        console.log("📋 Event details:", JSON.stringify(event, null, 2));

        if (event.media_type === "movie") {
            const imdbId = event.imdb_id;

            if (imdbId) {
                console.log(`🎬 IMDb ID ontvangen: ${imdbId}`);

                // Vraag de filmgegevens op bij Radarr
                const response = await axios.get(`${RADARR_URL}/movie`, {
                    headers: { "X-Api-Key": RADARR_API_KEY },
                });

                const movie = response.data.find((m: any) => m.imdbId === imdbId);

                if (movie) {
                    console.log("✅ Film gevonden in Radarr:");
                    console.log(JSON.stringify(movie, null, 2));

                    const originalFilePath = event.file;

                    // Controleer beschikbaarheid
                    if (!movie.hasFile || (movie.movieFile && movie.movieFile.relativePath === "dummy.mp4")) {
                        console.log("❌ Dummy file detected or movie not available. Initiating search...");
                        await searchMovieInRadarr(movie.id);
                        await monitorAvailability(movie.id, originalFilePath);
                    } else {
                        console.log(`🎉 Movie "${movie.title}" is already available!`);
                    }
                } else {
                    console.log("❌ Film niet gevonden in Radarr.");
                }
            } else {
                console.log("⚠️ Geen IMDb ID ontvangen in het verzoek.");
            }
        } else if (event.media_type === "episode") {
            console.log("📺 Afspeelactie voor een aflevering gedetecteerd.");
        }
    } else {
        console.log("⚠️ Ontvangen event is geen playback.start:", event.event);
    }

    res.status(200).send("Webhook ontvangen.");
});

app.post("/radarr-webhook", async (req: Request, res: Response) => {
    const event = req.body;

    console.log("📩 Radarr Webhook ontvangen:", event);

    // Controleer of het een evenement is voor een nieuwe film
    if (event && event.eventType === "MovieAdded" && event.movie && event.movie.id) {
        const movieFolder = event.movie.folderPath; // De folderlocatie van de film
        const dummySource = "/Media/dummy.mp4"; // Pad naar het dummy-bestand
        const dummyLink = path.join(movieFolder, "dummy.mp4"); // Doel van de symlink

        console.log(`🎬 Nieuwe film toegevoegd met dummy tag. Folder: ${movieFolder}`);

        // Maak de symlink
        await createSymlink(dummySource, dummyLink);

        res.status(200).send("Symlink created successfully.");
    } else {
        console.log("⚠️ Geen geldig MovieAdded-event ontvangen.");
        res.status(200).send("Invalid event.");
    }
});

// Start de server
app.listen(PORT, () => {
    console.log(`🚀 Webhook server luistert op poort ${PORT}`);
});
