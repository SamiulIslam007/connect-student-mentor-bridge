# Spec Delta

## REMOVED Requirements

### Requirement: No affiliation claim flow yet

This capability SHALL expose only the seeded reference data and SHALL NOT grant any affiliation level, so no endpoint in it accepts a claim or changes a user's affiliation.

#### Scenario: Claim attempt has no endpoint

- **WHEN** a client calls any affiliation-claim path
- **THEN** the response is `404` and no affiliation record is created or changed

**Reason**: `affiliation-and-mentor-onboarding` adds the affiliation claim endpoint (`POST /v1/me/affiliations`) and the seeded attestation that grants Level 1, so a requirement forbidding every claim path now contradicts the system.

**Migration**: The claim flow, its Level 1 rule, and the seeded attestation are specified by the new capability `institutions/affiliation-verification`. This capability keeps its idempotent-seed, unique-domain, and case-insensitive-domain requirements unchanged.
