## ADDED Requirements

### Requirement: Password-protected admin page
The system SHALL provide an admin page, usable from a phone, protected by a password.

#### Scenario: Correct password
- **WHEN** the correct password is submitted
- **THEN** a signed session cookie SHALL be set and the controls SHALL be shown

#### Scenario: No session
- **WHEN** the page is opened without a valid session
- **THEN** only the sign-in form SHALL be shown

### Requirement: Remote control of playback
The system SHALL let an administrator skip the current photo, hide a photo
permanently, un-hide it, and force a resync.

#### Scenario: Skip
- **WHEN** Skip is pressed
- **THEN** the frame SHALL advance within approximately 10 seconds

#### Scenario: Hide
- **WHEN** Hide is pressed for the photo on screen
- **THEN** that photo SHALL be removed from the manifest and SHALL leave the screen

#### Scenario: Un-hide
- **WHEN** a hidden photo is un-hidden
- **THEN** it SHALL return to the rotation

### Requirement: Remote settings
The system SHALL let an administrator change the interval, transition duration and
style, screen on/off hours, brightness, and whether caption and date are shown.

#### Scenario: Settings saved
- **WHEN** settings are saved
- **THEN** the frame SHALL adopt them on its next poll

### Requirement: Commands delivered once
The system SHALL deliver each queued command exactly once.

#### Scenario: Command drained
- **WHEN** the frame polls and receives a command
- **THEN** that command SHALL NOT be delivered again

### Requirement: Status reporting
The frame SHALL report what it is showing, along with its battery level and version,
so the administrator can see its state.

#### Scenario: Frame healthy
- **WHEN** the frame is cycling normally
- **THEN** the admin page SHALL show the current photo and the report time

#### Scenario: Frame silent
- **WHEN** no report has arrived for over 5 minutes
- **THEN** the admin page SHALL warn that the frame may be asleep or offline
