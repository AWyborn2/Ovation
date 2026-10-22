# Sunset: conversion and polish report

Converted from the `sunset-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **polished, pending Ash sign-off**. The polish is applied by `scripts/src/lib/pack-convert/polish/`, so a re-conversion keeps it.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 94% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 5.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 1 hd.

## bigMoment

### card

- From `card.single`.
- Layers: 25 shape, 7 image, 38 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 94%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## century

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 7 image, 36 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## clubLeaderboard

Polish applied:

- leaders.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 16 shape, 7 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 94%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## countdown

### card

- From `card.single`.
- Layers: 17 shape, 7 image, 34 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 93%         | none         |
| story     | 95%         | none         |
| landscape | 95%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## debut

### card

- From `card.single`.
- Layers: 19 shape, 1 photo, 7 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 90%         | none         |
| story     | 93%         | none         |
| landscape | 94%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## fiveFor

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 7 image, 38 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 17 shape, 1 photo, 7 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## ladder

### card

- From `card.single`.
- Layers: 22 shape, 7 image, 71 text, 2 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 93%         | none         |
| landscape | 94%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- background-color color(srgb 0.879422 0.364225 0.547833 / 0.314824)
- color color(srgb 0.905098 0.499608 0.644118)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## matchDay

Polish applied:

- fixture: the round line prints the grade too (a core field the pack's card leaves out)
- sponsors: one 3-column logo grid (12 logos) in place of the pack's major / other tiers; 9 converted layers replaced

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 27 shape, 9 image, 49 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### title

- From `title.slide`.
- Layers: 19 shape, 1 photo, 7 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### day

- From `day.slide`.
- Layers: 16 shape, 7 image, 19 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 91%         | none         |
| story     | 92%         | none         |
| landscape | 91%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### sponsors

- From `sponsors.slide`.
- Layers: 22 shape, 1 photo, 7 image, 34 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 96%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 22 shape, 1 photo, 9 image, 43 text, 3 group; 1 stack group(s).

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 93%         | none         |
| story     | 95%         | none         |
| landscape | 95%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

### day

- From `day.slide`.
- Layers: 12 shape, 3 image, 19 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 90%         | none         |
| story     | 91%         | none         |
| landscape | 90%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## milestone

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 7 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 95%         | none         |
| story     | 96%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## newSigning

### card

- From `card.single`.
- Layers: 18 shape, 1 photo, 7 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 93%         | none         |
| landscape | 94%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## player

### card

- From `card.single`.
- Layers: 28 shape, 1 photo, 7 image, 45 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)
- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## premiership

### card

- From `card.single`.
- Layers: 11 shape, 1 photo, 1 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## record

### card

- From `card.single`.
- Layers: 17 shape, 1 photo, 7 image, 30 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 97%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 12 shape, 1 photo, 3 image, 24 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)

## weekendWrap

Polish applied:

- matches.outcome: drawn as a chip (3 rows layers)
- matches.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.weekend-wrap`.
- Layers: 16 shape, 7 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | overflow     |
| portrait  | 92%         | overflow     |
| story     | 94%         | overflow     |
| landscape | 95%         | overflow     |

Polish:

- filter drop-shadow(rgba(0, 0, 0, 0.4) not mapped (×4)
- backdrop-filter: blur(18px) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.905098 0.499608 0.644118)
