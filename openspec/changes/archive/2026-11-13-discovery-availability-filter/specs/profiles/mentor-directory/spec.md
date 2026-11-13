# Spec Delta

## ADDED Requirements

### Requirement: A day and window filter narrows the directory by availability

The public directory SHALL accept `available_weekday` (1 to 7), `available_start` and `available_end` (minute of day), and `available_timezone` (an IANA zone defaulting to `Asia/Dhaka`), SHALL return only mentors holding at least one `MENTOR`-context window that overlaps the requested window, and SHALL compare the two in UTC rather than by wall-clock minute.

#### Scenario: A covering window matches

- **WHEN** a mentor's stored window fully covers the requested weekday and window in the same zone
- **THEN** that mentor appears in the result

#### Scenario: A later window does not match

- **WHEN** a mentor's stored window starts after the requested window ends
- **THEN** that mentor does not appear

#### Scenario: The comparison is in UTC, not wall clock

- **WHEN** the viewer's zone and a mentor's zone differ by more than the requested window's length in hours
- **THEN** the mentor appears only when the two intervals genuinely overlap once converted, and never because the wall-clock hours happen to coincide

#### Scenario: A window crossing midnight matches both adjacent weekdays

- **WHEN** a mentor's stored window ends after 1440 minutes in converted terms, or the requested window crosses midnight in the viewer's zone
- **THEN** the mentor is matched on the weekday the window covers on the other side of midnight as well

#### Scenario: A mentor with no availability is excluded

- **WHEN** the availability filter is applied
- **THEN** a mentor with no `MENTOR`-context window is absent from the result, and present when the filter is not applied

### Requirement: A malformed availability filter is refused, not ignored

The directory SHALL refuse a partial window, an `available_end` that does not exceed `available_start` or exceeds 1440, a weekday outside 1 to 7, and a zone it cannot resolve, each as `422 VALIDATION_FAILED` naming the parameter, and SHALL NOT silently drop a filter it cannot interpret.

#### Scenario: A weekday without a window is refused

- **WHEN** the caller sends `available_weekday` with no start or end
- **THEN** the response is `422` naming the missing parameter and no list is returned

#### Scenario: An inverted window is refused

- **WHEN** `available_end` is less than or equal to `available_start`
- **THEN** the response is `422` naming `available_end`

#### Scenario: An unresolvable zone is refused

- **WHEN** `available_timezone` names no zone the runtime can resolve
- **THEN** the response is `422` naming `available_timezone`

#### Scenario: The day select is offered with the other filters

- **WHEN** a student opens the directory page
- **THEN** a weekday select, a start and end time, a zone defaulted from the browser, and a control that clears the filters are all present, and an empty result names the availability filter
