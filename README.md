# Infinite Plex Library (BETA!)

![image](https://i.imgur.com/vKRC57h.gif)

## Overview

This project allows you to create an infinite Plex library without pre-downloading movies from your Debrid provider. The script sets up a "dummy" MP4 file of 1 second for each movie requested in Radarr with the "dummy" tag. When you play a movie in Plex, Tautulli sends a webhook notification to the script, which then triggers the actual movie request in Radarr.

Using this approach, you can leverage Radarr to populate your Plex with lists of movies marked with a "dummy" tag without actively monitoring them. When a movie is played, the script modifies its status and begins the download process.

This script can also be used in combination with Kometa. Use Kometa to create collections like 'Today Popular on x' or 'Most Downloaded Movies This Week' Kometa can add these movies to Radarr with the dummy tag, allowing you to display them in Plex without actually requesting them upfront. You can showcase these collections on your Plex Home for all users, providing them with a 'Netflix-like' experience.

With this script, you can manage a large Plex library without overloading your Debrid Providers or Indexers. Movies are typically available within two minutes if they are cached by the provider!

> **Note**: This script is currently in BETA.

## Features

- **Infinite Plex Library**: Seamlessly maintain a large Plex library without needing to add all the movies to your Debrid provider in advance.
- **Dynamic Movie Retrieval**: Automatically request movies through Radarr upon playback in Plex.
- **Tautulli Integration**: Tautulli webhooks trigger movie downloads, minimizing resource usage until a movie is actually played.
- **Kometa Compatibility**: Use this script alongside Kometa to create popular movie categories that are added in an unmonitored state.
- **Efficient Debrid Utilization**: Avoid overloading Debrid Providers and Indexers, ensuring availability only when needed.

## How It Works

1. **Dummy File Setup**: When a movie is added to Radarr (via Kometa, Radarr lists or manually), with tag "dummy" and not monitored, the script places a 1-second dummy MP4 file in the Plex directory for that movie.
2. **Playback Detection**: When you play a movie in Plex, Tautulli sends a webhook notification to the script.
3. **Movie Request**: The script checks the library and, if the movie is only a dummy, it requests the full movie via Radarr.
4. **Fast Availability**: If the movie is cached by the Debrid provider, it becomes available in Plex within approximately one or two minutes.

## Installation & Usage
Ensure that your Tautulli is set up to send playback start events to the webhook URL configured for this script.

### Tautulli
Create a new Notification Agent in the Tautulli settings.

**Webhook URL**: http://ip:port/webhook

**Webhook method**: POST

**Trigger**: Playback Start

**Condition**: Filename is dummy.mp4

**JSON Data for playback start**:
```
{
    "event": "playback.start",
    "file": "{file}",
    "imdb_id": "{imdb_id}",
    "user": "{user}",
    "title": "{title}",
    "plex_id": "{rating_key}",
    "rating_key": "{rating_key}",
    "media_type": "{media_type}",
    "player": "{player}"
}
```
### Radarr
Radarr list example:
![image](https://github.com/user-attachments/assets/f1e939cf-31b3-4752-9a30-f6a9ae7f7800)

Create this Connect webhook in Radarr to communicate with the script if a new movie with the tag 'dummy' is added:
![image](https://github.com/user-attachments/assets/ad4c87f1-accd-4026-81d2-cf329f026508)

### Kometa

config.yml
```
radarr:
  url: http://192.168.1.237:7878
  token: xxxxxx
  add_missing: true
  add_existing: false
  upgrade_existing: false
  monitor_existing: false
  root_folder_path: /plex/Movies
  monitor: false
  availability: announced
  quality_profile: Radarr
  tag: dummy
  search: false
  plex_path: /media/Movies
```

## Prerequisites

- **Plex Media Server**
- **Tautulli** for playback detection
- **Radarr** for managing and requesting movies

## Example Use Cases

- **Manage Large Libraries**: Add thousands of movies to Plex without overwhelming your Debrid provider by using dummy placeholders.
- **Kometa Integration**: Combine with Kometa collections to add trending movies automatically to Radarr with tag "dummy".
- **Efficient Storage Use**: Keep a vast Plex library without using extensive storage or network resources until the content is actually played.

## Known Limitations

- **BETA Version**: The script is still in beta, so there are cases that aren't fully handled.

## To-do

- Sonarr support
- Better code
- A scheduler that checks if there are movies that should have a dummy file but do not have one yet.
- Make a better Docker image
- Some ideas from the community

## Contributing

Contributions are welcome! Please submit a pull request or raise an issue to discuss improvements or report bugs.

## Disclaimer

Use this script at your own risk. This is a beta version and may contain bugs or limitations that could affect library management or playback experience.

---

If you have any questions or need further assistance, feel free to reach out or create an issue on the GitHub repository.
Discord: spinix3845
