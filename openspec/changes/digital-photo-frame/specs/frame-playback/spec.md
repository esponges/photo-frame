## ADDED Requirements

### Requirement: Shuffle with a no-repeat window
The frame SHALL play photos in a shuffled order in which no photo repeats until
almost the whole library has been shown.

#### Scenario: Full pass
- **WHEN** the frame has shown N-1 of N photos
- **THEN** the remaining unshown photo SHALL be shown before any repeat

#### Scenario: Cycle exhausted
- **WHEN** every photo in the queue has been shown
- **THEN** the queue SHALL be reshuffled and playback SHALL continue

### Requirement: New photos appear promptly
The frame SHALL splice newly added photos into the remainder of the current cycle
rather than appending them, so an upload appears within minutes.

#### Scenario: Upload mid-cycle
- **WHEN** photos are added to the Drive folder partway through a cycle
- **THEN** they SHALL be scattered through the not-yet-played portion of the queue

#### Scenario: Photo removed or hidden
- **WHEN** a photo is removed from the library or hidden
- **THEN** it SHALL be dropped from the queue and never displayed

### Requirement: Playback resumes after restart
The frame SHALL persist its queue and position, so a reboot resumes playback rather
than restarting the cycle.

#### Scenario: Reboot
- **WHEN** the device restarts
- **THEN** playback SHALL continue from the saved position

### Requirement: Presentation on a portrait panel
The frame SHALL display each photo whole, without cropping, filling letterboxed
areas with the server-generated blurred backdrop.

#### Scenario: Portrait photo
- **WHEN** a portrait photo is displayed
- **THEN** it SHALL fill the panel and no backdrop SHALL be shown

#### Scenario: Landscape photo
- **WHEN** a landscape photo is displayed
- **THEN** the blurred backdrop SHALL fill the area above and below it

### Requirement: Timed transitions
The frame SHALL display each photo for a configurable interval and cross-fade
between photos over a configurable duration.

#### Scenario: Default pacing
- **WHEN** no settings have been changed
- **THEN** photos SHALL change every 60 seconds with a 1500ms cross-fade

#### Scenario: Interval changed from admin
- **WHEN** the interval is changed in the admin page
- **THEN** the frame SHALL adopt it without needing a reinstall

### Requirement: Caption and date overlay
The frame SHALL display the photo's caption and the current date, each
independently switchable.

#### Scenario: Captioned photo
- **WHEN** a photo has a caption and captions are enabled
- **THEN** the caption SHALL be displayed legibly over the photo

#### Scenario: Uncaptioned photo
- **WHEN** a photo has no caption
- **THEN** no caption area SHALL be shown

### Requirement: Offline-first operation
The frame SHALL cache the whole photo library on disk and SHALL continue playing
when the network or backend is unavailable.

#### Scenario: Network lost
- **WHEN** Wi-Fi is unavailable
- **THEN** the frame SHALL keep cycling through cached photos indefinitely

#### Scenario: Cold start with no network
- **WHEN** the app starts with no network
- **THEN** it SHALL play from its last known cached library

### Requirement: Constrained memory use
The frame SHALL prefetch no more than one upcoming photo, because a decoded
1200x1920 bitmap is roughly 9MB on a device with 2GB of RAM.

#### Scenario: Steady playback
- **WHEN** the frame is cycling
- **THEN** at most one photo ahead SHALL be decoded into memory

### Requirement: Video playback with skip-on-failure
The frame SHALL play videos muted and SHALL skip any that cannot start promptly,
because the device has no HEVC decoder.

#### Scenario: Playable H.264 clip
- **WHEN** a clip the device can decode is reached
- **THEN** it SHALL play muted and advance when it ends

#### Scenario: Undecodable clip
- **WHEN** a clip does not begin playing within 3 seconds
- **THEN** the frame SHALL advance rather than display a black screen

#### Scenario: Offline
- **WHEN** the frame is offline and reaches a video
- **THEN** it SHALL skip it, since videos are never cached
