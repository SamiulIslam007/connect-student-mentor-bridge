# mentorship/outcome-evidence Specification

## Purpose
Stores the one document a student may attach to their own outcome: a private file whose declared type, size and digest are checked against the bytes received, quarantined until a malware scan is clean, readable only through a short-lived link by the student, the mentorship's mentor, or a platform admin whose read is audited, and only ever served when it raised the outcome's evidence tier rather than a rejected or unscanned file.

## Requirements

### Requirement: A student attaches one file to their own outcome

The system SHALL let the mentorship's student attach exactly one file to an outcome they reported, SHALL accept only PDF, PNG and JPEG content up to 5 MiB, SHALL record the file's SHA-256, size and declared type, SHALL keep the file private in object storage, and SHALL refuse a second file for the same outcome.

#### Scenario: A PDF is attached

- **WHEN** the reporting student creates the evidence intent and completes it with a PDF under the size bound
- **THEN** one evidence row exists for that outcome with its SHA-256, size and content type, and the stored object is not publicly readable

#### Scenario: A second file is refused

- **WHEN** the student attaches a second file to an outcome that already has evidence
- **THEN** the response is `409 EVIDENCE_ALREADY_ATTACHED`, no new row is written and the first file is unchanged

#### Scenario: A disallowed type is refused

- **WHEN** the declared content type is not `application/pdf`, `image/png` or `image/jpeg`
- **THEN** the response is `422` naming the field, no row is written and no object is stored

#### Scenario: An oversize file is refused

- **WHEN** the body exceeds 5 MiB
- **THEN** the response is `413 PAYLOAD_TOO_LARGE`, no row is written and no object is stored

#### Scenario: The content is not trusted because the client said so

- **WHEN** a completed upload's stored bytes do not match the declared type or its recorded SHA-256
- **THEN** the evidence is marked `REJECTED` by the scan job and is never served

#### Scenario: Only the reporting student attaches evidence

- **WHEN** the mentor, a non-participant, an institution admin or a platform admin calls either route
- **THEN** the response is `404` for a non-participant caller and `403` for a participant who is not the reporting student, and nothing is written

### Requirement: Evidence is quarantined until a scan is clean

The system SHALL create every evidence record in a quarantined state, SHALL run a malware scan in a background job after the upload completes, SHALL move the record to `CLEAN` only on a clean result, SHALL mark it `REJECTED` on a positive result, and SHALL leave it quarantined when the scanner is unavailable or errors.

#### Scenario: A clean file becomes available

- **WHEN** the scan answers clean
- **THEN** the evidence status is `CLEAN` and the outcome's `evidence_tier` is `1`

#### Scenario: An infected file is rejected and never served

- **WHEN** the scan reports a detection
- **THEN** the evidence status is `REJECTED`, no download link is ever produced for it, and the outcome's tier stays `0`

#### Scenario: A scanner outage fails closed

- **WHEN** the scanner cannot be reached or the connection fails mid-stream
- **THEN** the status stays `QUARANTINED`, the job records the failure and retries, no download link is produced, and the tier stays `0`

#### Scenario: A scan never runs twice on the same file

- **WHEN** the job runs again for an evidence row that is already `CLEAN` or `REJECTED`
- **THEN** it does nothing and no status changes

#### Scenario: The tier never falls on a re-scan

- **WHEN** an outcome's only evidence is `CLEAN`
- **THEN** `evidence_tier` is `1`, and the counting job's multiplier for tier 1 applies

### Requirement: A file is readable only through a short-lived private link

The system SHALL return a short-lived presigned link only for a `CLEAN` file, SHALL produce it for the reporting student, that mentorship's mentor, and a platform admin with an enrolled second factor, SHALL write exactly one `EVIDENCE_VIEWED` audit entry before returning a link to a platform admin, and SHALL answer `404` to every other caller and `409 EVIDENCE_NOT_READY` for a file that is not clean.

#### Scenario: The student reads their own file

- **WHEN** the reporting student asks for the evidence on their outcome
- **THEN** the response is `200` with a link that expires, and no audit entry is written for that self-read

#### Scenario: The mentor reads the evidence

- **WHEN** the mentorship's mentor asks for the evidence of that mentorship's outcome
- **THEN** the response is `200` with a short-lived link

#### Scenario: A platform admin read is audited first

- **WHEN** a platform admin with an enrolled second factor asks for a link
- **THEN** exactly one `EVIDENCE_VIEWED` audit entry naming the actor, the outcome and the evidence exists before the link is returned

#### Scenario: Another student is refused

- **WHEN** an account that is neither the reporting student, that mentorship's mentor, nor a platform admin asks
- **THEN** the response is `404` and no link is produced

#### Scenario: A quarantined file has no link

- **WHEN** any caller asks for a link to an evidence row that is `QUARANTINED` or `REJECTED`
- **THEN** the response is `409 EVIDENCE_NOT_READY` and no link is produced

#### Scenario: The audit action is filterable

- **WHEN** a platform admin filters `GET /v1/admin/audit` by `EVIDENCE_VIEWED`
- **THEN** the response is `200` and carries the admin read rows

### Requirement: Admin evidence reading is case-scoped

A platform admin SHALL read evidence only when the outcome is in `IN_PLATFORM_REVIEW` or has an open review case linked to it, SHALL supply a reason, and SHALL write `EVIDENCE_VIEWED` with the case and reason before the link is produced. An unrelated counted, pending or rejected outcome SHALL answer `403 EVIDENCE_ACCESS_DENIED`; a participant's own read is unchanged.

#### Scenario: An unrelated admin is refused

- **WHEN** a platform admin with a factor asks for evidence on a `COUNTED` outcome with no open case
- **THEN** the response is `403 EVIDENCE_ACCESS_DENIED`, no link is produced, and no audit row is written

#### Scenario: A case-linked read is allowed

- **WHEN** the outcome is in `IN_PLATFORM_REVIEW` and the admin supplies a reason
- **THEN** the link is produced and exactly one `EVIDENCE_VIEWED` row carries the reason and the case

#### Scenario: A reason is required

- **WHEN** the admin supplies no reason or one longer than 1,000 characters
- **THEN** the response is `422` and no link or audit row is produced

#### Scenario: The participant read is unchanged

- **WHEN** the reporting student or the mentorship's mentor reads their own evidence
- **THEN** the response is `200` with a short-lived link and no admin audit row

#### Scenario: The case is rechecked at read time

- **WHEN** the review case closes between the admin's page load and the read
- **THEN** the read is refused with the same `403` and nothing is disclosed
