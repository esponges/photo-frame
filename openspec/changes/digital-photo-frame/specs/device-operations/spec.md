## ADDED Requirements

### Requirement: Kiosk display
The frame SHALL occupy the whole screen in portrait with no system chrome, and
SHALL keep the screen on while it is meant to be visible.

#### Scenario: Running
- **WHEN** the app is in the foreground
- **THEN** no status bar or navigation bar SHALL be visible

#### Scenario: Stray tap
- **WHEN** the screen is touched and system bars appear
- **THEN** they SHALL hide again automatically

### Requirement: Relaunch after reboot
The frame SHALL start automatically after the device reboots, so a power cut does
not leave a blank wall.

#### Scenario: Reboot
- **WHEN** the device finishes booting
- **THEN** the frame SHALL start without manual intervention

### Requirement: Scheduled screen on and off
The frame SHALL turn the screen off and on at configured hours, to limit wear on a
2013 LCD and avoid a lit screen overnight.

#### Scenario: Off hour reached
- **WHEN** the configured off hour arrives
- **THEN** the screen SHALL turn off

#### Scenario: On hour reached
- **WHEN** the configured on hour arrives
- **THEN** the screen SHALL turn on at the configured brightness

#### Scenario: Window spanning midnight
- **WHEN** the on hour is later in the day than the off hour, such as on=22 off=02
- **THEN** the window SHALL be treated as wrapping midnight

#### Scenario: Deterministic control
- **WHEN** the schedule fires
- **THEN** explicit SLEEP and WAKEUP key events SHALL be used rather than the POWER
  toggle, so a missed event cannot invert the schedule permanently

#### Scenario: Root unavailable
- **WHEN** superuser access is not granted
- **THEN** the frame SHALL continue running and only the scheduling SHALL be inactive

### Requirement: TLS trust on an old Android build
The frame SHALL be able to reach the backend over HTTPS on an Android build whose
trust store may predate current certificate authorities.

#### Scenario: Trust store lacking the modern root
- **WHEN** the device's system trust store does not contain ISRG Root X1
- **THEN** the app SHALL still connect, because it bundles that root as an
  additional trust anchor

#### Scenario: Verifying a device
- **WHEN** a device is being set up
- **THEN** its trust store SHALL be checked directly rather than inferred from the
  Android version string, because ROMs vary

### Requirement: Compile-time device configuration
The frame SHALL take its backend URL and token at build time, so the tablet needs
no setup interface.

#### Scenario: Configured build
- **WHEN** the backend URL and token are present in local configuration
- **THEN** they SHALL be compiled into the app

#### Scenario: Unconfigured build
- **WHEN** the backend URL is missing
- **THEN** the build SHALL emit a warning and the app SHALL display a setup message
  rather than failing silently
