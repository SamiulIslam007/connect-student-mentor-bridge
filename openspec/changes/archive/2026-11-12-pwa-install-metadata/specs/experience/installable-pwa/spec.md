# Spec Delta

## ADDED Requirements

### Requirement: The web app declares a valid install identity

The web application SHALL serve a web app manifest that declares the application name, a short name, a start URL, `display` equal to `standalone`, a background colour, a theme colour, and an icon list containing an entry at exactly 192 pixels and an entry at exactly 512 pixels. The manifest and the icons SHALL be reachable without authentication.

#### Scenario: The manifest is served

- **WHEN** a browser requests the manifest path of the running application
- **THEN** the response is `200` with a JSON-compatible content type and a body carrying name, short name, start URL, display, background colour, theme colour and the icon list

#### Scenario: The display mode is standalone

- **WHEN** any client reads the manifest
- **THEN** `display` is exactly `standalone`, so an installed app opens without browser chrome

#### Scenario: The name comes from the string catalog

- **WHEN** the manifest and the signed-in header are compared
- **THEN** both display the same application name, and neither hard-codes it

### Requirement: Every declared icon exists at the size it claims

Each icon entry SHALL name a file that exists in the built application and whose pixel dimensions equal the declared size, and the icon list SHALL contain at least one entry marked maskable.

#### Scenario: A declared icon is present and correctly sized

- **WHEN** the manifest's icon entries are resolved against the built application
- **THEN** every entry resolves to a file, and each file's width and height equal the size its entry declares

#### Scenario: A missing or mis-sized icon fails a gate

- **WHEN** an icon file is removed or replaced with one of a different size
- **THEN** the web test fails, because a missing icon otherwise breaks installability with no error surfaced anywhere

#### Scenario: A maskable icon is declared

- **WHEN** the icon list is read
- **THEN** at least one entry carries the maskable purpose, and its artwork stays inside the middle 80 percent of the frame

### Requirement: No service worker and no offline cache exist

The application SHALL NOT register a service worker and SHALL NOT ship an offline cache in this release.

#### Scenario: No registration exists

- **WHEN** any page or client module under the web application is inspected
- **THEN** it registers no service worker, and no service-worker file exists in the application

#### Scenario: Installing the app does not imply offline use

- **WHEN** a user installs the application and then loses connectivity
- **THEN** no offline content is served from a cache, and the offline and error states of `FR-UX-02` remain the open work they are recorded as
