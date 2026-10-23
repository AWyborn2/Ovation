# Reconciled email and card-feature migration history

`0064_preserve_email_history` follows the reconciled entries below. It replaces
the send-log list cascade with `ON DELETE SET NULL`; its snapshot includes the
newer social-email and combined-sheet features. No isolated applied entry or
snapshot is changed.

The email features were first imported without the other social-card work.
Those applied records and snapshots must remain immutable:

| Migration | Journal index | Timestamp |
| --- | --- | --- |
| `0053_email_lists` | 51 | 1792465777969 |
| `0056_social_email_lists` | 56 | 1792465777970 |

The local 0056 SQL lacks upstream's trailing newline. Its recorded hash is pinned
to those local bytes; do not reformat the file or rewrite the ledger.

## Integration of the remaining main-branch features

The four previously excluded migrations now follow the applied email entries,
using their original upstream SQL bytes and execution timestamps:

| Migration | Journal index | Timestamp |
| --- | --- | --- |
| `0051_card_name_overrides` | 57 | 1792467199632 |
| `0052_card_content_settings` | 58 | 1792474763002 |
| `0054_photo_usage` | 59 | 1792482920757 |
| `0055_sponsors_page` | 60 | 1792483889790 |

This ordering is valid for both an existing development database and a fresh
database: the card-feature migrations do not need to precede the email tables.
Do not insert duplicate upstream 0053/0056 entries at their later upstream
timestamps, and never rewrite existing ledger rows.

## Snapshot ancestry

The historical isolated snapshots are retained. The final combined snapshot
`0060_snapshot.json` is generated from the complete merged schema and descends
directly from the isolated `0056_snapshot.json`. It describes the result of all
four appended migrations; there is no extra SQL migration numbered 0060.
Upstream's intermediate 0051/0052/0054/0055 snapshots are omitted because they
describe a different ancestry that did not contain the isolated email changes.

Journal indices need not equal upstream SQL filenames. The final index is 60 so
future generation starts at 0061 rather than overwriting a historical snapshot.
Always review journal order, snapshot ancestry, file hashes and the actual
database ledger together before importing another branch's migration metadata.

## Email batch integration

`0057_email_send_batches.sql` retains its original SQL bytes. It is appended at
journal index 62 with timestamp 1792557638982, after the already-applied
`0061_team_name_all_grades_guard` entry. Its upstream timestamp predates that
entry and would otherwise make the migration runner skip it.

The combined `0062_snapshot.json` descends from `0061_snapshot.json`; the upstream
0057 snapshot is omitted because it describes the unreconciled branch history.
There is no separate 0062 SQL migration. Future generation starts at index 63.
