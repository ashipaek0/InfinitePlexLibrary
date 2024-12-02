import axios from "axios";
import { config } from "../config";

export async function terminateStreamByFile(originalFilePath: string) {
    try {
        // Retrieve all active sessions from Tautulli
        const { data } = await axios.get(`${config.TAUTULLI_URL}`, {
            params: {
                cmd: "get_activity",
                apikey: config.TAUTULLI_API_KEY,
            },
        });

        if (data && data.response && data.response.data && data.response.data.sessions) {
            const sessions = data.response.data.sessions;

            // Search for a session with the provided original file path
            const session = sessions.find((s: any) => s.file === originalFilePath);

            if (session) {
                console.log(`🎬 Active stream found: Session ID ${session.session_id}, File: ${originalFilePath}`);

                // Terminate the session
                await axios.get(`${config.TAUTULLI_URL}`, {
                    params: {
                        cmd: "terminate_session",
                        apikey: config.TAUTULLI_API_KEY,
                        session_id: session.session_id,
                        message: config.TAUTULLI_STREAM_TERMINATED_MESSAGE,
                    },
                });

                console.log(`✅ Stream terminated for file: ${originalFilePath}`);
            } else {
                console.log(`❌ No active stream found for file: ${originalFilePath}`);
            }
        } else {
            console.log("❌ No active sessions found.");
        }
    } catch (error: any) {
        console.error("❌ Error while terminating stream:", error.message);
    }
}