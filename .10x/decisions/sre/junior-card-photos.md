# sre — junior-card-photos

See `.10x/reviews/2026-10-16-junior-card-photos-review.md` (QA and Security) and `decisions/sde/junior-card-photos.md`.

- Watch after release: `select count(*) from junior_photos` as clubs upload; the first junior card with a photo in the queue; a withheld player's photo returning 404 publicly. Failure modes: object missing → the serving route 404s and the card renders without a photo; migration not applied → the junior players admin and sweep error on the missing columns (apply 0045, no data step).
