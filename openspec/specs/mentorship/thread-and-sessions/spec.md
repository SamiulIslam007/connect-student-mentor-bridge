# mentorship/thread-and-sessions Specification

## Purpose
Turns an accepted request into a working mentorship: the pair, the thread they talk in, a lightweight agreement, and the planned sessions that let both sides agree a meeting actually happened.

## Requirements

### Requirement: A mentorship is created only by accepting a request

A mentorship SHALL record the request it came from (unique), the student and mentor profiles, the field copied from that request, a status of `ACTIVE`, `COMPLETED`, or `ENDED_EARLY`, and `is_paid` fixed at false in the MVP.

#### Scenario: Accepting creates the mentorship

- **WHEN** a mentor accepts a `PENDING` request
- **THEN** exactly one mentorship exists for that request with status `ACTIVE`, `started_at` set, and `is_paid` false

#### Scenario: A retried acceptance creates no second mentorship

- **WHEN** the same acceptance is submitted a second time
- **THEN** the request answers `409 REQUEST_INVALID_STATE` and exactly one mentorship still exists

#### Scenario: A decline or an expiry creates no mentorship

- **WHEN** a request is declined, withdrawn, or expires
- **THEN** no mentorship row exists for that request

#### Scenario: A third account cannot read the mentorship

- **WHEN** an account that is neither the student nor the mentor reads the mentorship by id
- **THEN** the response is `404` and no field of the mentorship or its participants is disclosed

### Requirement: The thread is participant-only

The thread SHALL be readable and writable by the mentorship's two participants only through the participant routes, SHALL reject any other account with `404` on those routes, and SHALL list messages oldest first with a keyset cursor. The thread SHALL be readable by an account outside the pair only through the audited break-glass read defined by the next requirement, and by no other path.

#### Scenario: Both participants read the thread

- **WHEN** either participant lists the messages
- **THEN** the response is `200` with the messages ordered oldest first and a `next_cursor` that is null on the last page

#### Scenario: A third account is refused

- **WHEN** an account that is neither participant lists the messages
- **THEN** the response is `404` and no message body is disclosed

#### Scenario: A third account cannot post

- **WHEN** an account that is neither participant posts a message
- **THEN** the response is `404` and no message row is written

### Requirement: A message is text with a bound

The system SHALL accept a text-only message body, SHALL trim it before storing, SHALL refuse an empty or over-length body with `422` naming the field, and SHALL NOT accept attachments or edits.

#### Scenario: A valid message is stored

- **WHEN** a participant posts a non-empty body inside the length bound
- **THEN** one message row is written with the sender's user id, the trimmed body, and a server timestamp

#### Scenario: An empty body is refused

- **WHEN** a participant posts a body that is empty or only whitespace
- **THEN** the response is `422` with an error naming `body` and no message row is written

#### Scenario: An over-length body is refused

- **WHEN** a participant posts a body above the documented maximum
- **THEN** the response is `422` with an error naming `body` and no message row is written

#### Scenario: Messages are not editable

- **WHEN** a participant sends an update request for an existing message
- **THEN** the response is `404` because no such route exists, and the stored message is unchanged

### Requirement: One email is queued per message

Posting a message SHALL queue exactly one email to the other participant through the outbox, keyed on the message id, and SHALL NOT send mail inline, so a retried request queues nothing new.

#### Scenario: Exactly one email per message

- **WHEN** a participant posts one message
- **THEN** exactly one outbox email event exists for it, addressed to the other participant

#### Scenario: A retry queues nothing new

- **WHEN** the same message post is delivered twice
- **THEN** one message row exists and exactly one email event exists

#### Scenario: The email does not carry the thread

- **WHEN** the notification email is queued
- **THEN** its body names the sender and links to the mentorship, and carries no other message's text

### Requirement: The agreement is proposed and acknowledged by both parties

A participant SHALL be able to set the agreement's `cadence`, `planned_weeks`, and `goal`, and each party SHALL acknowledge it separately, recording one acknowledgement timestamp per party that a later acknowledgement does not overwrite.

#### Scenario: Setting the agreement

- **WHEN** a participant sets a cadence, a planned duration, and a goal
- **THEN** the values are stored on the mentorship and both participants see them

#### Scenario: One party acknowledges

- **WHEN** the student acknowledges the agreement
- **THEN** the student acknowledgement timestamp is set, the mentor's stays null, and the mentorship stays `ACTIVE`

#### Scenario: Both parties acknowledge

- **WHEN** student and mentor have each acknowledged
- **THEN** both timestamps are set and the agreement is reported as acknowledged

#### Scenario: An unknown cadence is refused

- **WHEN** a participant sets a cadence outside `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `AD_HOC`
- **THEN** the response is `422` and the stored agreement is unchanged

### Requirement: A session carries a mentor-provided https link

A participant SHALL be able to record a planned session with a start time, a duration in minutes, and a meeting URL that MUST begin with `https://`; the system SHALL refuse any other scheme with `422` and SHALL treat the stored link as untrusted display text.

#### Scenario: A session is scheduled

- **WHEN** a participant records a start time, a duration, and an `https://` link
- **THEN** one session row exists with status `SCHEDULED` and the creator's user id

#### Scenario: A plain-http link is refused

- **WHEN** the meeting URL starts with `http://` or any scheme other than `https://`
- **THEN** the response is `422` with an error naming `meeting_url` and no session row is written

#### Scenario: Missing or out-of-range values are refused

- **WHEN** the start time is absent or the duration is outside the documented bounds
- **THEN** the response is `422` with a field error and no session row is written

#### Scenario: The link is shown as untrusted

- **WHEN** the session is rendered to either participant
- **THEN** the copy states that the link is provided by the mentor and opens outside connect

### Requirement: A session is held only when both confirm

A scheduled session SHALL move to `HELD` only after both participants confirm it was held, SHALL record one confirmation timestamp per party, and SHALL let either participant cancel it with a reason.

#### Scenario: One confirmation is not enough

- **WHEN** one participant confirms the session was held
- **THEN** the status stays `SCHEDULED` and only that party's confirmation timestamp is set

#### Scenario: Both confirmations make it held

- **WHEN** both participants have confirmed the same session
- **THEN** the status is `HELD` and both timestamps are set

#### Scenario: Either party cancels

- **WHEN** either participant cancels a `SCHEDULED` session with a reason
- **THEN** the status is `CANCELLED`, the reason is stored, and no further confirmation is accepted

#### Scenario: A held session cannot be cancelled

- **WHEN** a participant cancels a session that is already `HELD`
- **THEN** the response is `409 MENTORSHIP_INVALID_STATE` and the session is unchanged

### Requirement: A mentorship is completed once

Either participant SHALL be able to complete an `ACTIVE` mentorship exactly once, setting `COMPLETED` and `ended_at`, and a second attempt SHALL be refused with `409` while a non-participant SHALL receive `404`.

#### Scenario: Completing an active mentorship

- **WHEN** either participant completes the mentorship
- **THEN** the status is `COMPLETED`, `ended_at` is set, and the response reports the completion

#### Scenario: Completing twice

- **WHEN** a participant completes a mentorship that is no longer `ACTIVE`
- **THEN** the response is `409 MENTORSHIP_INVALID_STATE` and nothing changes

#### Scenario: A third account completes

- **WHEN** an account that is neither participant sends the completion
- **THEN** the response is `404` and nothing changes

### Requirement: The mentorship page shows the thread, agreement, and sessions

The signed-in mentorship page SHALL show the request summary, the thread, the agreement state, and the session list for a participant, SHALL use the string catalog for every label, and SHALL render loading, empty, error, and saved states.

#### Scenario: A participant opens the page

- **WHEN** either participant opens the mentorship page
- **THEN** the request summary, the ordered messages, the agreement state, and the sessions are shown

#### Scenario: Sending a message from the page

- **WHEN** a participant sends a message and the BFF answers success
- **THEN** the message appears in the thread without a full page reload

#### Scenario: A refused send is explained

- **WHEN** the API refuses the message with `422`
- **THEN** the page keeps the typed text, shows the string-catalog problem, and does not claim the message was sent

#### Scenario: A non-participant opens the page

- **WHEN** a signed-in account that is not a participant opens the page
- **THEN** the page states that the mentorship does not exist and shows no thread content

### Requirement: A platform admin reads a thread only through audited break-glass

The system SHALL allow an account holding `PLATFORM_ADMIN` with an enrolled second factor to read a mentorship's thread, its agreement and its session records through one route that requires a stated reason of at most 1000 characters, SHALL append exactly one audit entry carrying the acting account, the mentorship and the reason before any content is returned, and SHALL refuse every other caller.

#### Scenario: The read succeeds and is audited

- **WHEN** a platform admin with an enrolled second factor submits a reason for a mentorship they are not part of
- **THEN** the response is `200` with the messages oldest first, the agreement and the session records, and exactly one audit entry exists carrying the acting account, the mentorship id, the reason and the break-glass marker

#### Scenario: No content is returned without an audit entry

- **WHEN** any break-glass read returns content
- **THEN** its audit entry was already written, so a response without a matching entry cannot occur

#### Scenario: A missing or empty reason is refused

- **WHEN** the request carries no reason or a reason that is empty after trimming
- **THEN** the response is `422` naming the field, no audit entry is written, and no content is returned

#### Scenario: An over-long reason is refused

- **WHEN** the reason exceeds 1000 characters
- **THEN** the response is `422` with a message that states the limit, no audit entry is written, and no content is returned

#### Scenario: A caller without the role is refused

- **WHEN** a student, a mentor or an institution admin calls the break-glass route
- **THEN** the response is `403` with code `ROLE_REQUIRED`, no audit entry is written, and no content is returned

#### Scenario: A platform admin without a second factor is refused

- **WHEN** a platform admin with no enrolled second factor calls the break-glass route
- **THEN** the response is `403` with code `MFA_REQUIRED`, the request is refused before any write, no audit entry is written, and no content is returned

#### Scenario: An anonymous caller is refused

- **WHEN** a client with no session calls the break-glass route
- **THEN** the response is `401`, no audit entry is written, and no content is returned

#### Scenario: An unknown mentorship is not found

- **WHEN** the route names a mentorship id that does not exist
- **THEN** the response is `404`, no audit entry is written, and no content is returned

#### Scenario: The projection is the participant projection

- **WHEN** any break-glass response is returned
- **THEN** it carries the same thread, agreement and session shape a participant receives, and no outcome text, no profile text and no email address

#### Scenario: The response is not cacheable

- **WHEN** any break-glass response is returned
- **THEN** it carries `Cache-Control: no-store`
