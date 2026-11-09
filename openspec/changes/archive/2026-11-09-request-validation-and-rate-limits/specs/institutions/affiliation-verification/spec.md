# Spec Delta

## MODIFIED Requirements

### Requirement: A claim acts only on the caller's own account

The claim endpoint SHALL resolve the subject from the session only and SHALL refuse any account-level property in the body, including `user_id`, with a `422` naming that property rather than ignoring it.

#### Scenario: A body `user_id` is ignored

- **WHEN** a signed-in account submits a claim whose body names another account's `user_id`
- **THEN** the response is `422` naming `user_id`, no affiliation row is created or changed for the other account, and the property never influences which account the claim is written for
