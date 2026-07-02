# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Tenancy and data sources

### Tenant
A club's independently branded site together with its own app database of curated content. Every curated row and every admin belongs to exactly one tenant and is never blended across tenants.

### Central database
The shared, read-only association dataset of matches, batting, bowling, and players spanning many clubs, keyed on PlayHQ identifiers. The app only ever reads it; corrections are made app-side and never written back.
*Avoid:* central PCA DB

### Central-read model
The mode in which a tenant's stats are served by filtering the central database to that tenant's club, rather than from native app tables. A given tenant either reads from central or from its own native tables.

## Player identity

### Participant GUID
PlayHQ's career-stable identifier for a person, used as the primary key for players and scorecard lines in the central database. Distinct people are reliably separable only by this id — central display names are stored as "Initial Surname" and collide.

### Crosswalk
The per-tenant mapping from a central participant GUID to a stable app-facing integer player id, so a central row can present a clickable, correctly-separated player. Minted when a tenant is provisioned and backfilled afterwards; a missing entry is what makes a central player's link dead.
*Avoid:* player_id_map (that is the table; the concept is the crosswalk)

### Fill-in player
A placeholder player, identified by an id at or above the fill-in floor, standing in for an unidentified participant. Excluded from every stat derivation so borrowed or unknown players never distort club records.

### Player curation
A per-tenant, app-side overlay that corrects how a central player appears on a club's site — renaming the "Initial Surname" to a real name, or merging duplicate GUIDs into one player. Applied on read; never alters the central database.

## Milestones

### Career crossing
A milestone marking the match at which a player's running career total — games, runs, or wickets — first passes a configured tier. Derived by accumulating a player's matches in chronological order.
