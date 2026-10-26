# Confirmed junior full names

## Delivery and impact (21 October 2026)

No production names, privacy settings, photo permissions, GUIDs, statistics,
senior links or merge maps were changed by this work. Publishing/deploying the
application does **not** apply any name suggestions.

The development read-only review found **694 profiles**, including **6 withheld**
profiles:

| Review outcome                                                         | Profiles |
| ---------------------------------------------------------------------- | -------: |
| One compatible expanded name, eligible for selected admin confirmation |      681 |
| Identity details need review                                           |        7 |
| Abbreviated evidence only                                              |        5 |
| Already expanded, protected from suggested replacement                 |        1 |

These counts include withheld profiles. A suggestion is evidence to review, not
proof of identity or permission to publish a child's identity. The stricter
classifier rejects contradictory abbreviated evidence as well as conflicting full
names, so its totals need not match a simple “one expanded candidate” SQL count.

The supplied production feasibility snapshot had **726 profiles**, **6 withheld**,
and 590 non-private initial-labelled profiles with one plausible expanded name.
That is a supplied historical baseline, **not a newly verified production audit**.
An attempted read-only production query was blocked because this task environment
does not have authenticated production database access. Development and production
datasets differ; neither profile rows nor approved development selections should
be copied to production.

## Owner-controlled application

After this change is merged and available in the club's app:

1. Sign in as a club admin and open **People → Junior players**.
2. Choose **Preview suggested full names**. Opening, searching and inspecting
   evidence changes no names.
3. Review current/proposed names, participant GUIDs, seasons, teams and the
   roster/batting/bowling/premiership source records. Identical initials are never
   grounds to combine identities.
4. Select only identities the admin can confirm. **Publish selected** opens a
   before/after confirmation showing the current public effect for each player.
   Cancel leaves every public name unchanged.
5. For missing, contradictory, already expanded or previously corrected names,
   choose **Edit full name**, or open the player's profile editor. Admin knowledge
   is sufficient. Enter the correct given name and surname, then use the explicit
   **Save and publish full name** confirmation.
6. A withheld player stays withheld. First-name-only and surname-initial naming
   styles still shorten confirmed names. Changing the canonical name never sets a
   privacy override or grants photo consent. Opposition names remain initials.
7. Stale selections reject the entire batch. Refresh and review again. An exact
   retry skips completed work rather than creating duplicate corrections.
8. The existing junior corrections journal records the previous name, confirmed
   name, actor and time. Its note preserves confirmation mode, preview revision
   and source evidence. Restore through the existing newest-first correction
   revert action; imports replay remaining active corrections.

New records from supported future imports appear in the same review queue. No
senior record is read to infer a name.

## Verification

- API integration fixtures cover case-insensitive GUID evidence, separate
  same-initial identities, tenant isolation, authorization, manual publication,
  conflict resolution, repeat requests, stale evidence/settings, atomic batches,
  name correction/revert, privacy, opposition initials, directory search, linked
  premierships and scorecards.
- The entire historical loader is executed twice against transaction-local shadow
  tables, including scope guards, synced-participant detection, replacement,
  corrections, metadata recomputation and merge replay. An uppercase stored GUID
  with lowercase synced lines retains nonzero historical/synced statistics, full
  name, privacy/photo settings, senior link, journal and merge map; another club
  reusing the GUID remains unchanged. The fixture includes an active merge whose
  keeper and duplicate GUID casing differs from staging, with roster and
  premiership deduplication. A separate API regression verifies that a newer
  publication blocks reverting an older differently-cased correction, and that
  restoring both newest-first succeeds. The actual live participant writer is also
  exercised with journalled names and shorter/conflicting source names. These
  tests never reload a real club's dataset.
- Web interaction tests cover preview, evidence inspection, selected approval,
  manual entry, before/after confirmation, cancellation and withholding messages.
- The development-only browser smoke script uses a disposable tenant and real
  admin session middleware, and cleans up its own records:
  `pnpm --filter @workspace/api-server exec tsx src/test/junior-name-browser.ts`.
- The browser check passed selected/manual publication and cancel flows, phone
  web directory/profile layouts, Expo-web directory/profile layouts with a long
  compound name, and square/portrait/story junior milestone PNG exports.
- Native iPhone/Android store builds are not part of this change. The mobile app
  continues to consume the same privacy-filtered junior APIs; directory name
  labels now wrap instead of truncating at one line.
