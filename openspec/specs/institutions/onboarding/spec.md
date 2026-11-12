# institutions/onboarding Specification

## Purpose
Creating a partner institution and registering its email domains: who may do it, what one transaction writes including the audit trail, the uniqueness rule on a domain, and the platform-admin read that lists institutions with their domains (D-109 to D-113).

## Requirements

### Requirement: A platform admin creates an institution with its domains

The system SHALL create an institution with a required name, kind and two-letter country code, an optional MoU date, and an optional list of email domains, only for a caller holding `PLATFORM_ADMIN` with an enrolled second factor, in one transaction that writes the institution, one row per domain, and the audit rows for both.

#### Scenario: An institution is created

- **WHEN** a platform admin with an enrolled second factor posts a name, a kind, a country code, an MoU date and two domains
- **THEN** the response is `201` with the created institution carrying status `ONBOARDING` and both domains, and reading the list afterwards returns the same institution

#### Scenario: The optional fields are omitted

- **WHEN** the same caller posts only a name, a kind and a country code
- **THEN** the institution is created with a null MoU date and no domains, and the response reports an empty domain list

#### Scenario: A caller without the platform-admin role

- **WHEN** a signed-in account without `PLATFORM_ADMIN` posts to the create route
- **THEN** the response is `403` with code `ROLE_REQUIRED` and no row is written

#### Scenario: A platform admin without a second factor

- **WHEN** a platform admin with no enrolled second factor posts to the create route
- **THEN** the request is refused before any write, and no institution row exists afterwards

#### Scenario: A bound is violated

- **WHEN** the body carries an empty name, an unknown kind, a country code that is not two letters, a future MoU date, or a domain containing an at-sign
- **THEN** the response is `422` naming the field and nothing is written

### Requirement: An institution domain is unique across institutions

Each registered domain SHALL be unique across all institutions, compared without regard to letter case, and SHALL be stored lower-cased. A duplicate SHALL be refused with `409 INSTITUTION_DOMAIN_TAKEN` without creating the institution or any domain row.

#### Scenario: A duplicate domain is refused

- **WHEN** a caller registers a domain that an institution already holds
- **THEN** the response is `409` with code `INSTITUTION_DOMAIN_TAKEN` and no institution row is created

#### Scenario: Letter case does not create a second claim

- **WHEN** the same domain is submitted as upper case, lower case and mixed case
- **THEN** exactly one domain row exists and every later attempt answers `409`

#### Scenario: The write is one transaction

- **WHEN** a create request carries one new domain and one duplicate domain
- **THEN** no institution is created and no domain row is written

### Requirement: Institution creation is audited

Creating an institution SHALL append exactly one `INSTITUTION_CREATED` audit row naming the actor, and registering a domain SHALL append exactly one `INSTITUTION_DOMAIN_REGISTERED` row per domain, both inside the creation transaction, and neither SHALL carry a raw email address.

#### Scenario: The audit rows exist after a creation

- **WHEN** an institution is created with two domains
- **THEN** exactly one `INSTITUTION_CREATED` row and exactly two `INSTITUTION_DOMAIN_REGISTERED` rows exist, all naming the acting account

#### Scenario: A refused creation leaves no audit row

- **WHEN** a creation is refused for a duplicate domain or a validation error
- **THEN** no audit row of either action is written

#### Scenario: No email address is recorded

- **WHEN** any audit row written by this route is read
- **THEN** its metadata holds the domain and the institution attributes and no at-sign, no password, and no token

### Requirement: A platform admin lists the institutions with their domains

The system SHALL return every institution with its status and its domains to a caller holding `PLATFORM_ADMIN` with an enrolled second factor, in a stable order, with no pagination in this release.

#### Scenario: The list carries domains and status

- **WHEN** a platform admin reads the list after creating two institutions
- **THEN** both appear, each with its status and its own domains only

#### Scenario: A caller without the role reads nothing

- **WHEN** an institution admin, a mentor or an anonymous client reads the list
- **THEN** the response is `403` or `401` and no institution is disclosed

#### Scenario: The order is stable

- **WHEN** the list is read twice with no intervening write
- **THEN** both responses are in the same order
