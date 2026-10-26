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

Team social slides may display a number using a unique exact full-name match when ID lookups do not resolve. This is presentation only, not permission to recover or change player identities.

**Why:** The user explicitly approved this exception after team-list-imported register entries acquired different player IDs from published Selection Hub lists.

**How to apply:** Prefer verified IDs. Scope names to the fixture's club, season and senior register; ignore case and repeated whitespace only. Refuse duplicate register names (including unnumbered rows), duplicate team/roster names, private placeholders and known private/fill-in members. Never override an explicitly unnumbered register identity. Do not rewrite publications, profiles or saved carousel snapshots.

A public junior selected in a senior side may display their allocated senior-register number, including through the same presentation-only exact-name fallback.

**Why:** The user expects allocated numbers to appear for junior members playing senior cricket. A junior roster section alone does not invalidate their senior allocation; imported register player IDs can differ from the selected player's historical ID.

**How to apply:** Choose the register by fixture category and season, not roster section. Keep private-member blocks and ambiguity checks. Never borrow a junior-register number for a senior card. Saved card snapshots require explicit regeneration to pick up later assignments.
