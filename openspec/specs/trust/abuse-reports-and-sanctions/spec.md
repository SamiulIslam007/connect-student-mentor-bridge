# trust/abuse-reports-and-sanctions Specification

## Purpose

Gives a student, a mentor, or any signed-in user a way to report harm, and gives the platform owner one place to read those reports and to suspend an account with a written reason. The capability exists because the product pairs strangers in a private thread and publishes mentors publicly; without a report path the only remedy is an out-of-band SQL statement, which leaves no audit trail and no notice to the person affected.

## Requirements

### Requirement: Any signed-in user can report a user, message, profile, or outcome

A signed-in user SHALL be able to create one report naming a target kind (`USER`, `MESSAGE`, `PROFILE`, or `OUTCOME`), the target id, a reason from a fixed set, and optional free text within a bound. The report SHALL store the reporter, the target, the time, and the status `OPEN`.

#### Scenario: A report is created

- **WHEN** a signed-in user reports a message in a mentorship they participate in
- **THEN** one `reports` row exists with that reporter, target kind `MESSAGE`, the message id, and status `OPEN`, and the response is `201`

#### Scenario: An unknown or malformed target is refused

- **WHEN** the target kind is not one of the four, the target id is not a valid id, or the reason is outside the fixed set
- **THEN** the response is `422 VALIDATION_FAILED` naming the field and no report row is written

#### Scenario: A signed-out caller is refused

- **WHEN** a request arrives without a valid session
- **THEN** the response is `401` and no report row is written

### Requirement: A report is refused when the reporter cannot see the target

The system SHALL refuse a report on a message, profile, or outcome the reporter is not entitled to read, using the same authorization rules as the read it refers to, and SHALL answer the same refusal as a nonexistent target.

#### Scenario: A message the reporter cannot see is refused

- **WHEN** a user reports a message from a mentorship they do not participate in
- **THEN** the response is `404` and no report row is written, so the route reveals nothing about the target's existence

#### Scenario: A participant can report their own thread's message

- **WHEN** a participant reports a message in their own mentorship
- **THEN** the report is accepted and the reporter is recorded as the reporting party

#### Scenario: The reported user is never told who reported them

- **WHEN** a report is created, resolved, or acted on
- **THEN** no response, email, or audit metadata visible to the reported user names the reporter

### Requirement: Only a platform admin with a second factor reads and resolves reports

The system SHALL expose the report queue and the resolution route only to a caller holding `PLATFORM_ADMIN` with an enrolled second factor, and SHALL resolve a report exactly once with a decision and a written reason.

#### Scenario: A non-admin cannot read the queue

- **WHEN** a signed-in user without the platform admin role requests the report queue
- **THEN** the response is `403` with `ROLE_REQUIRED` and no case is returned

#### Scenario: A platform admin without a second factor is refused

- **WHEN** an admin without an enrolled second factor requests the queue or resolves a report
- **THEN** the response is `403` with `MFA_REQUIRED` and no case is returned or changed

#### Scenario: A report is resolved once

- **WHEN** an admin resolves an open report as actioned or dismissed with a reason
- **THEN** the status, the decision, the reason, the resolver, and the time are stored, and a second resolution of the same report is refused with `409`

#### Scenario: The reporter is told the outcome, not the sanction

- **WHEN** a report is resolved
- **THEN** exactly one email is queued to the reporter stating that the report was resolved, and it names no sanction detail and no reporter-facing identity of the person acted on

### Requirement: A platform admin suspends an account with a reason and an optional end date

The system SHALL let a platform admin suspend an account by id with a required reason and an optional end date. Suspension SHALL set the status to `SUSPENDED`, store the end date when given, revoke every session row, append one audit entry, and queue one notice email to the account, all in one transaction.

#### Scenario: A suspended account loses all sessions atomically

- **WHEN** an admin suspends an account that holds two open sessions
- **THEN** both session rows are gone in the same transaction as the status change, and the next request with either token is `401`

#### Scenario: The suspension is represented with its end date

- **WHEN** an admin suspends an account with an end date
- **THEN** the account row carries `SUSPENDED` and that date, the admin queue shows it, and the audit entry and the notice email carry it

#### Scenario: The reason is required

- **WHEN** a suspension request omits the reason or sends an empty one
- **THEN** the response is `422 VALIDATION_FAILED` naming `reason`, the status is unchanged, and no session is revoked

#### Scenario: The suspended user is told why, not who

- **WHEN** the notice email is queued
- **THEN** it states the reason and the end date if any, and it names no reporter, no report id, and no other user

### Requirement: A suspension racing a sign-in leaves no live session

After the identity library issues a session, the sign-in path SHALL re-read the account status and SHALL revoke the issued session and refuse the sign-in when the status is no longer `ACTIVE`. The refusal SHALL be the same one a suspension at sign-in time produces.

#### Scenario: A session issued for a newly suspended account is revoked

- **WHEN** the account becomes `SUSPENDED` after the library created the session
- **THEN** the issued session is revoked before the response, the response is `403 ACCOUNT_SUSPENDED`, and the token authenticates nothing

#### Scenario: The status predicate covers every non-active state

- **WHEN** the post-session status check runs against `PENDING`, `SUSPENDED`, `DEACTIVATED`, `DELETION_PENDING`, or `ANONYMIZED`
- **THEN** each refuses with the documented code for that status, and only `ACTIVE` returns a session

### Requirement: Every admin action appends one audit row and queues one notice

Each report resolution and each suspension SHALL append exactly one audit entry naming the acting admin, the affected object, the decision or reason, and the request id, and SHALL queue exactly one email through the outbox in the same transaction.

#### Scenario: Exactly one audit row per admin action

- **WHEN** an admin resolves a report and then suspends the account
- **THEN** two audit entries exist, one per action, each naming the admin as actor and the request id of its own request

#### Scenario: The audit row carries no report content

- **WHEN** the audit entry for a resolution is read
- **THEN** it carries the decision and the reason, and no message body, no email address, and no token

### Requirement: A warning is recorded and notifies the account

The system SHALL let a platform admin with an enrolled second factor warn an account by id with a required reason, SHALL append one audit entry naming the admin, the account and the reason, SHALL queue one notice email carrying the reason, and SHALL NOT change the account status, the end date, or any session.

#### Scenario: A warning changes no status

- **WHEN** an admin warns an `ACTIVE` account
- **THEN** the status stays `ACTIVE`, the end date stays null, every open session still works, one audit entry exists and one notice is queued

#### Scenario: The reason is required

- **WHEN** a warning request omits the reason or sends an empty one
- **THEN** the response is `422 VALIDATION_FAILED` naming `reason` and no audit entry is written

#### Scenario: Warnings accumulate

- **WHEN** the same account is warned twice
- **THEN** two audit entries exist and the account's warning count reads two

#### Scenario: The notice names no reporter

- **WHEN** the warning notice is queued
- **THEN** it carries the reason and names no reporter, no report id, and no other user

### Requirement: A platform admin lifts a suspension with a reason

The system SHALL let a platform admin with an enrolled second factor return a `SUSPENDED` account to `ACTIVE` with a required reason, SHALL clear the stored end date, SHALL append one audit entry, and SHALL queue one notice, all in one transaction. A lift SHALL apply only to a `SUSPENDED` account.

#### Scenario: A suspension is lifted

- **WHEN** an admin lifts a suspension with a reason
- **THEN** the status is `ACTIVE`, the end date is null, one audit entry names the admin and the reason, and one notice is queued

#### Scenario: An account that is not suspended is refused

- **WHEN** an admin lifts an account that is `ACTIVE`, `DEACTIVATED` or `ANONYMIZED`
- **THEN** the response is `409 ACCOUNT_NOT_SUSPENDED` and nothing is written

#### Scenario: A lift does not create a session

- **WHEN** a suspension is lifted
- **THEN** no session row exists for the account and the account signs in with its own password

#### Scenario: A mentor caller is refused

- **WHEN** a mentor or an institution admin calls the lift route
- **THEN** the response is `403` and nothing is written

### Requirement: A passed end date lifts a suspension on a schedule

A scheduled job SHALL lift every suspension whose stored end date is in the past, SHALL NOT lift a suspension with no end date, SHALL append one audit entry and queue one notice per lifted account, SHALL be bounded per run, and SHALL change nothing on a second run.

#### Scenario: A passed end date is lifted

- **WHEN** the job runs and an account is `SUSPENDED` with an end date in the past
- **THEN** the account becomes `ACTIVE`, the end date is null, one audit entry exists naming the job as the actor, and one notice is queued

#### Scenario: An indefinite suspension is untouched

- **WHEN** the job runs and an account is `SUSPENDED` with no end date
- **THEN** the account stays `SUSPENDED` and no audit entry is written for it

#### Scenario: A future end date is untouched

- **WHEN** the job runs and an account's end date is still in the future
- **THEN** the account stays `SUSPENDED`

#### Scenario: A second run changes nothing

- **WHEN** the job runs twice over the same data
- **THEN** the second run writes no audit entry, queues no notice and changes no status

#### Scenario: A concurrent suspension wins

- **WHEN** an account is suspended again at the moment the job tries to lift the earlier suspension
- **THEN** exactly one of the two writes applies, and the account's status matches the write that won
