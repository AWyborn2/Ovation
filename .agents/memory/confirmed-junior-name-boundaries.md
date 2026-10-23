---
name: Confirmed junior name boundaries
description: Identity, consent and rollout constraints for confirming junior full names.
---

Junior full-name suggestions must use only the same club's junior-source records
under the same stable participant ID. An authorised club admin may confirm a name
from personal knowledge even when sources are missing or contradictory. Initials
and surname are compatibility checks, never grounds to merge or link identities.
Letter casing in a participant GUID does not identify a different child.

**Why:** The owner explicitly requires identity confirmation rather than guessing
first names, combining same-initial players, or inferring identities from senior
cross-links.

**How to apply:** Keep manual confirmation available alongside conservative
suggestions. Publishing a canonical name is separate from privacy overrides and
photo consent, and must respect each club's selected public naming style.

Production application is an owner-approved admin action, not a deployment or
startup side effect. Never copy the development junior participant dataset to
production.

**Why:** The owner noted materially different development/production populations
and explicitly excluded automatic production name changes.

**How to apply:** Report aggregate candidate counts with their environment and
verification date; do not present a supplied historical snapshot as a fresh audit.
