# Spec Delta

## MODIFIED Requirements

### Requirement: Each participant has a read marker in the thread

The system SHALL store exactly one read marker per participant per mentorship, SHALL advance that marker only through an explicit mark-read write from that participant, SHALL never move it backwards, SHALL report an `unread_count` counting only messages written by the other participant after the marker, and SHALL NOT move a marker when a moderator reads the thread through break-glass access. The mentorship page SHALL send that mark-read write when a participant opens it, the mentorship list SHALL show each mentorship's `unread_count`, and the thread SHALL mark where the previous marker fell, so a participant can see which messages are new.

#### Scenario: A participant marks the thread read

- **WHEN** a participant submits the mark-read write for a mentorship they belong to
- **THEN** the response is `200` with that participant's marker at the server's current instant and `unread_count` `0`

#### Scenario: The marker never moves backwards

- **WHEN** a participant marks the thread read, and the same write is delivered a second time with an earlier clock
- **THEN** the response is `200` and the stored marker is unchanged, because the update is conditional on a later instant

#### Scenario: Unread counts the other party's newer messages

- **WHEN** the mentor posts three messages after the student's marker
- **THEN** the student's `unread_count` is `3` and the mentor's own `unread_count` is unchanged by those messages

#### Scenario: A participant's own messages are never unread

- **WHEN** a participant with a marker at time T posts a message after T
- **THEN** their own `unread_count` is unchanged

#### Scenario: A participant who never opened the thread sees every message

- **WHEN** a participant reads a mentorship on which no marker row exists
- **THEN** `unread_count` equals the number of messages the other participant has written

#### Scenario: A third account cannot write a marker

- **WHEN** a signed-in account that is neither participant submits the mark-read write
- **THEN** the response is `404` and no marker row is written

#### Scenario: An anonymous caller cannot write a marker

- **WHEN** a client with no session submits the mark-read write
- **THEN** the response is `401` and no marker row is written

#### Scenario: A read does not mark anything read

- **WHEN** either participant lists the messages or reads the mentorship without the page's own mark-read write
- **THEN** no marker is written and no marker moves

#### Scenario: A break-glass read leaves the markers alone

- **WHEN** a platform admin reads the thread through the audited break-glass route
- **THEN** both participants' markers are unchanged and their `unread_count` values are unchanged

#### Scenario: The marker goes with the mentorship

- **WHEN** a mentorship row is deleted
- **THEN** its marker rows are deleted with it and no orphan row remains

#### Scenario: The count is reported where the participant starts

- **WHEN** a participant reads one mentorship or lists their mentorships
- **THEN** each mentorship in the response carries `unread_count` and no message body, sender name or email address beyond the existing projection

#### Scenario: Opening the thread marks it read

- **WHEN** a participant opens the mentorship page
- **THEN** the page sends the mark-read write for that mentorship exactly once per load, and renders the `unread_count` the response reports

#### Scenario: The list shows what is waiting

- **WHEN** a participant opens the mentorship list and one mentorship has an `unread_count` above zero
- **THEN** that row shows the count, and a mentorship with a zero count shows no badge

#### Scenario: New messages are marked in the thread

- **WHEN** a participant opens a mentorship whose `unread_count` is above zero
- **THEN** the thread marks the point where the participant's previous marker fell, and the marker disappears once the thread is marked read

#### Scenario: A failed mark-read write does not lose the messages

- **WHEN** the mark-read write is refused or fails
- **THEN** the page keeps the thread rendered, shows the string-catalog error line, and does not claim the thread was marked read
