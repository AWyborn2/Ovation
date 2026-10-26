# Sunset: conversion and polish report

Converted from the `sunset-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **polished, pending Ash's sign-off**. The polish is applied by `scripts/src/lib/pack-convert/polish/`, so a re-conversion keeps it.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 95% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 11.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 1 hd.

## bigMoment

### card

- From `card.single`.
- Layers: 30 shape, 8 image, 38 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## century

### card

- From `card.single`.
- Layers: 21 shape, 1 photo, 8 image, 36 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## clubLeaderboard

Polish applied:

- leaders.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 17 shape, 8 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 95%         | none         |
| landscape | 94%         | none         |

Converter notes (from the raw conversion):

- rows leaders: row style top dropped (not a style this list has) (×3)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## countdown

### card

- From `card.single`.
- Layers: 18 shape, 8 image, 34 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## debut

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 8 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## fiveFor

### card

- From `card.single`.
- Layers: 21 shape, 1 photo, 8 image, 38 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 18 shape, 1 photo, 8 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## ladder

### card

- From `card.single`.
- Layers: 19 shape, 8 image, 41 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

Colours not tokenised:

- background-color color(srgb 0.879422 0.364225 0.547833 / 0.314824)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.905098 0.499608 0.644118)

## matchDay

Polish applied:

- fixture: the round line prints the grade too (a core field the pack's card leaves out)
- sponsors: one 3-column logo grid (12 logos) in place of the pack's major / other tiers; 9 converted layers replaced

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 31 shape, 10 image, 49 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### title

- From `title.slide`.
- Layers: 20 shape, 1 photo, 8 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 93%         | none         |
| story     | 95%         | none         |
| landscape | 95%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### day

- From `day.slide`.
- Layers: 17 shape, 8 image, 19 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 91%         | none         |
| story     | 92%         | none         |
| landscape | 92%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### sponsors

- From `sponsors.slide`.
- Layers: 23 shape, 1 photo, 8 image, 34 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 93%         | none         |
| landscape | 96%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 23 shape, 1 photo, 10 image, 43 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 97%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Converter notes (from the raw conversion):

- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### day

- From `day.slide`.
- Layers: 13 shape, 4 image, 19 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 91%         | none         |
| story     | 91%         | none         |
| landscape | 91%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## milestone

### card

- From `card.single`.
- Layers: 21 shape, 1 photo, 8 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## newSigning

### card

- From `card.single`.
- Layers: 19 shape, 1 photo, 8 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## player

### card

- From `card.single`.
- Layers: 29 shape, 1 photo, 8 image, 45 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 93%         | none         |
| story     | 95%         | none         |
| landscape | 96%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)
- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## premiership

### card

- From `card.single`.
- Layers: 12 shape, 1 photo, 2 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## record

### card

- From `card.single`.
- Layers: 18 shape, 1 photo, 8 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 13 shape, 1 photo, 4 image, 24 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 94%         | none         |

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## weekendWrap

Polish applied:

- matches.outcome: drawn as a chip (3 rows layers)
- matches.gradeLabel: runs to the next cell (3 cells)
- matches.gradeLabel: font at most 0.34 of the cell's width
- matches.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.weekend-wrap`.
- Layers: 17 shape, 8 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 87%         | none         |
| portrait  | 87%         | none         |
| story     | 91%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)
