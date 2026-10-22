# Club Kit: conversion report

Converted from the `club-kit-v1` pack by `scripts/src/convert-pack.ts`, polished by hand, re-checked against the pack on 2026-10-22. Status: **polished, pending Ash's sign-off**; 17 of 24 kinds listed.

## Summary

- Kinds: 24; pages: 28.
- Mean pixel match against the pack: 93% over 112 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: none in the pack.
- Colours that move with the palette but aren't a token: 0.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 9 hd.

## announcement

### card

- From `card.single`.
- Layers: 35 shape, 5 image, 3 photo, 18 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 87%         | none         |
| portrait  | 93%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

## bigMoment

### card

- From `card.single`.
- Layers: 35 shape, 5 image, 3 photo, 26 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 93%         | none         |
| story     | 96%         | none         |
| landscape | 97%         | none         |

## century

### card

- From `card.single`.
- Layers: 37 shape, 5 image, 3 photo, 25 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 95%         | none         |
| story     | 96%         | none         |
| landscape | 98%         | none         |

## clubLeaderboard

### card

- From `card.Runs`; not used: `card.Wickets`, `card.Catches`, `card.Dismissals`.
- Layers: 32 shape, 5 image, 3 photo, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings                                                                                                           |
| --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| square    | 94%         | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| portrait  | 87%         | none                                                                                                                   |
| story     | 90%         | none                                                                                                                   |
| landscape | 94%         | none                                                                                                                   |

Converter notes (from the raw conversion):

- rows leaders: row style top dropped (not a style this list has) (×4)

## countdown

### card

- From `card.single`.
- Layers: 32 shape, 5 image, 3 photo, 26 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 94%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

## debut

### card

- From `card.single`.
- Layers: 33 shape, 5 image, 3 photo, 19 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 93%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

## fiveFor

### card

- From `card.single`.
- Layers: 37 shape, 5 image, 3 photo, 25 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 98%         | none         |

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 35 shape, 5 image, 3 photo, 23 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 94%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

## juniorHighlights

### card

- From `card.single`.
- Layers: 32 shape, 5 image, 3 photo, 20 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 59%         | none         |
| portrait  | 73%         | none         |
| story     | 52%         | none         |
| landscape | 59%         | none         |

## ladder

### card

- From `card.single`.
- Layers: 32 shape, 5 image, 3 photo, 26 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 96%         | none         |

Converter notes (from the raw conversion):

- the worst-case render runs off the card: boxes sized from the sentinel render

## matchDay

### fixture

- From `fixture.slide`; not used: `fixture.single`.
- Layers: 34 shape, 6 image, 3 photo, 39 text, 6 group; 2 stack group(s).

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 97%         | none         |

Converter notes (from the raw conversion):

- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- the worst-case render runs off the card: boxes sized from the sentinel render (×2)

### title

- From `title.slide`.
- Layers: 14 shape, 1 photo, 5 image, 25 text, 6 group; 2 stack group(s).

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 92%         | none         |
| story     | 95%         | none         |
| landscape | 95%         | none         |

### day

- From `day.slide`.
- Layers: 12 shape, 5 image, 15 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 92%         | none         |
| story     | 90%         | none         |
| landscape | 93%         | none         |

### sponsors

- From `sponsors.slide`.
- Layers: 25 shape, 1 photo, 17 image, 26 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 95%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 37 shape, 7 image, 3 photo, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 94%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 96%         | none         |

### day

- From `day.slide`.
- Layers: 10 shape, 3 image, 15 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 90%         | none         |
| story     | 87%         | none         |
| landscape | 92%         | none         |

## milestone

### card

- From `card.single`.
- Layers: 37 shape, 5 image, 3 photo, 24 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 95%         | none         |
| story     | 96%         | none         |
| landscape | 98%         | none         |

## newSigning

### card

- From `card.single`.
- Layers: 35 shape, 5 image, 3 photo, 22 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 93%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

## player

### card

- From `card.single`.
- Layers: 40 shape, 5 image, 3 photo, 48 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 98%         | none         |

## premiership

### card

- From `card.single`.
- Layers: 35 shape, 3 image, 3 photo, 22 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 93%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

## record

### card

- From `card.single`.
- Layers: 35 shape, 5 image, 3 photo, 20 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 93%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

## resultsSummary

### card

- From `card.results-summary`.
- Layers: 32 shape, 5 image, 3 photo, 19 text, 3 rows.

| Size      | Pixel match | Fit warnings                                                         |
| --------- | ----------- | -------------------------------------------------------------------- |
| square    | 84%         | overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| portrait  | 88%         | none                                                                 |
| story     | 91%         | none                                                                 |
| landscape | 95%         | none                                                                 |

## roundFixtures

### card

- From `card.game-day`.
- Layers: 32 shape, 5 image, 3 photo, 19 text, 3 rows.

| Size      | Pixel match | Fit warnings                                                                   |
| --------- | ----------- | ------------------------------------------------------------------------------ |
| square    | 91%         | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| portrait  | 88%         | overflow; overflow; overflow; overflow                                         |
| story     | 93%         | overflow; overflow; overflow; overflow                                         |
| landscape | 94%         | overflow; overflow; overflow; overflow                                         |

## sponsor

### card

- From `card.single`.
- Layers: 33 shape, 6 image, 3 photo, 23 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 94%         | none         |
| portrait  | 83%         | none         |
| story     | 92%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- sponsorArt: cropped to fill (object-fit: cover), drawn contained (×4)

## teamList

### team

- From `team.team-list`; not used: `team.starting-xi`, `team.slide`.
- Layers: 30 shape, 3 image, 3 photo, 18 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | overflow     |
| portrait  | 89%         | overflow     |
| story     | 96%         | overflow     |
| landscape | 94%         | overflow     |

## teamOfWeek

### card

- From `card.single`.
- Layers: 32 shape, 5 image, 3 photo, 15 text, 3 rows.

| Size      | Pixel match | Fit warnings                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| square    | 94%         | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| portrait  | 91%         | none                                                                                                                                                                                                                                                                                                                                                                   |
| story     | 93%         | none                                                                                                                                                                                                                                                                                                                                                                   |
| landscape | 95%         | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow                                                                                                                         |

## tradingCard

### card

- From `card.single`.
- Layers: 50 shape, 6 image, 4 photo, 34 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 89%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

## weekendWrap

### card

- From `card.weekend-wrap`.
- Layers: 32 shape, 5 image, 3 photo, 18 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 87%         | none         |
| story     | 91%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- the worst-case render runs off the card: boxes sized from the sentinel render
