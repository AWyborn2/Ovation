---
name: Held team-list identities
description: Safe identity recovery for Held playing numbers without changing published selections.
---

Held register entries may supply numbers on a selected team's fixture card without becoming historical player profiles.

**Why:** A club member can be selected and have an allocated number before they have a historical playing record. Requiring a player link would hide valid numbers or encourage incorrect profile creation.

**How to apply:** Preserve verified participant identity through publication. Do not create profiles or infer identity from surnames to make a number appear.

Do not assume the squad export's PlayHQ Profile ID is the participant GUID used in the playing-number register.

**Why:** The source namespaces can differ. All reported omissions happened to have matching IDs, which initially hid this broader constraint.

**How to apply:** Use an authoritative player link, or corroborate a Held member's identity against the fixture-season register with both the ID hint and a unique exact full name in that club's roster and register. Copy the verified register identity, not the raw profile field. Distinct or conflicting IDs without an authoritative link remain unresolved.

For older name-only publications, identity recovery must use a matching finalised selection, not a reopened draft or a club-wide name search. Keep the published lineup authoritative and refuse ambiguous or conflicting recovery.

**Why:** Reopening a side intentionally leaves the published team unchanged. Resolving from editable draft membership can attach another person's number to an approved name.

**How to apply:** Verify the complete published lineup, including order, roles and existing identities, before adding missing identities for generation. Warn when verification fails. Never rewrite saved carousel snapshots from current selections or registers.
