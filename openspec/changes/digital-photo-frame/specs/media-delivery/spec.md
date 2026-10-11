## ADDED Requirements

### Requirement: Panel-sized image delivery
The system SHALL deliver each photo resized to fit the tablet's 1200x1920 portrait
panel, without enlarging images that are already smaller.

#### Scenario: Oversized photo
- **WHEN** a 4000x3000 photo is requested
- **THEN** the response SHALL be a JPEG fitting inside 1200x1920 with aspect ratio preserved

#### Scenario: Undersized photo
- **WHEN** a photo smaller than the panel is requested
- **THEN** it SHALL NOT be upscaled

### Requirement: EXIF orientation baked into pixels
The system SHALL apply EXIF orientation during resizing, because older Android
ignores the orientation flag and would otherwise display photos sideways.

#### Scenario: Rotated photo
- **WHEN** a 4000x3000 landscape photo carrying EXIF orientation 6 is requested
- **THEN** the returned JPEG SHALL be portrait with the rotation already applied

### Requirement: Content-addressed immutable media URLs
The system SHALL include the file's md5 in the media URL and serve it as immutable,
so no blob store is needed and changed bytes receive a new URL.

#### Scenario: Repeat request
- **WHEN** the same photo is requested twice
- **THEN** the response SHALL carry `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Photo replaced in Drive
- **WHEN** a file's contents change, altering its md5
- **THEN** the manifest SHALL reference a different URL

### Requirement: Blurred backdrop generation
The system SHALL generate a 60x96 blurred version of each photo, so the device can
stretch it behind letterboxed images without performing any on-device blur.

#### Scenario: Backdrop request
- **WHEN** the backdrop URL for a photo is requested
- **THEN** the response SHALL be a 60x96 JPEG of a few hundred bytes

### Requirement: Non-JPEG safety net
The system SHALL convert any decodable source image to JPEG, so a single unexpected
file format cannot blank the frame.

#### Scenario: PNG in the folder
- **WHEN** a PNG is requested
- **THEN** the response SHALL be a JPEG

#### Scenario: Undecodable image
- **WHEN** the source cannot be decoded, such as HEIC without libheif
- **THEN** the response SHALL be HTTP 415 and the device SHALL skip the item

### Requirement: Video streaming without caching
The system SHALL range-proxy video from Drive and SHALL NOT cache it, and SHALL NOT
transcode it.

#### Scenario: Ranged request
- **WHEN** the player requests a byte range
- **THEN** the range SHALL be forwarded upstream and `Accept-Ranges` returned

#### Scenario: Caching policy
- **WHEN** a video is served
- **THEN** the response SHALL carry `Cache-Control: no-store`

### Requirement: Authenticated media access
The system SHALL require the device bearer token or an admin session for all media,
so the photos are not world-readable.

#### Scenario: Missing or wrong token
- **WHEN** a media request arrives without a valid token or admin session
- **THEN** the response SHALL be HTTP 401

#### Scenario: Video player request
- **WHEN** the Android video player requests a video
- **THEN** the token MAY be supplied as a query parameter, because `VideoView` on
  API 25 cannot attach an `Authorization` header
