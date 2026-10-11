## ADDED Requirements

### Requirement: Service-account access to a shared Drive folder
The system SHALL authenticate to the Google Drive API using a service account, so
that no user OAuth consent is required and credentials never expire.

#### Scenario: Folder shared with the service account
- **WHEN** the configured Drive folder has been shared with the service account's email
- **THEN** the backend SHALL list that folder's media without any interactive consent

#### Scenario: Folder not shared
- **WHEN** the folder has not been shared with the service account
- **THEN** the manifest endpoint SHALL return HTTP 502 with the upstream error message
- **AND** the admin page SHALL display the failure and name the likely cause

### Requirement: Media discovery
The system SHALL list image and video files in the configured folder, recursing one
level into subfolders so the library can be organised by trip or year.

#### Scenario: Photos in the root folder
- **WHEN** the folder contains image files
- **THEN** each SHALL appear in the manifest with its id, md5, dimensions and kind

#### Scenario: Photos in a subfolder
- **WHEN** the folder contains a subfolder holding images
- **THEN** those images SHALL also appear in the manifest

#### Scenario: Non-media and trashed files
- **WHEN** the folder contains trashed files or files that are neither image nor video
- **THEN** they SHALL be excluded from the manifest

### Requirement: Captions from the Drive description field
The system SHALL use each file's Drive `description` field as its on-screen caption,
so captions are editable from the Drive app and are backed up with the photos.

#### Scenario: Captioned photo
- **WHEN** a file has a non-empty description
- **THEN** the manifest SHALL carry that text as the item's caption

#### Scenario: Uncaptioned photo
- **WHEN** a file has no description
- **THEN** the caption SHALL be an empty string and no caption SHALL be displayed

### Requirement: Capture date extraction
The system SHALL expose each photo's EXIF capture time in ISO 8601 form, falling
back to the file's modified time when EXIF data is absent.

#### Scenario: EXIF time present
- **WHEN** Drive reports `imageMediaMetadata.time` as `2019:03:04 18:12:33`
- **THEN** the manifest SHALL carry a valid ISO 8601 timestamp, since that raw
  format is not parseable by standard date parsers

#### Scenario: EXIF time absent
- **WHEN** no EXIF time is available
- **THEN** the item's `takenAt` SHALL fall back to the file's `modifiedTime`

### Requirement: Manifest versioning
The system SHALL expose a version that changes whenever the visible set or any
caption changes, so the device can detect when to resync.

#### Scenario: Unchanged library
- **WHEN** the device requests the manifest with a matching `If-None-Match` header
- **THEN** the backend SHALL respond HTTP 304 with no body

#### Scenario: Caption edited in Drive
- **WHEN** a file's description changes
- **THEN** the manifest version SHALL change
