# Broadcast Dark: conversion report

Converted from the `broadcast-dark-v1` pack by `scripts/src/convert-pack.ts`, polished by hand, re-checked against the pack on 2026-10-22. Status: **polished, pending Ash's sign-off**; 17 of 17 kinds listed.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 96% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 6.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 4 hd.

## bigMoment

### card

- From `card.single`.
- Layers: 18 shape, 4 vector, 7 image, 35 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

## century

### card

- From `card.single`.
- Layers: 16 shape, 1 photo, 4 vector, 7 image, 33 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 99%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

## clubLeaderboard

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 10 shape, 4 vector, 7 image, 20 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 94%         | none         |
| portrait  | 93%         | none         |
| story     | 95%         | none         |
| landscape | 95%         | none         |

Converter notes (from the raw conversion):

- rows leaders: row style top dropped (not a style this list has) (×3)

## countdown

### card

- From `card.single`.
- Layers: 11 shape, 4 vector, 7 image, 33 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

## debut

### card

- From `card.single`.
- Layers: 15 shape, 1 photo, 4 vector, 7 image, 26 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

## fiveFor

### card

- From `card.single`.
- Layers: 16 shape, 1 photo, 4 vector, 7 image, 35 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×8)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 13 shape, 1 photo, 4 vector, 7 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 99%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

## ladder

### card

- From `card.single`.
- Layers: 11 shape, 4 vector, 7 image, 38 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 95%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Colours not tokenised:

- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.18)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.5)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.5)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.5)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.5)

## matchDay

### fixture

- From `fixture.slide`; not used: `fixture.single`.
- Layers: 27 shape, 4 vector, 1 photo, 13 image, 64 text, 10 group; 2 stack group(s).

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

### title

- From `title.slide`.
- Layers: 15 shape, 1 photo, 4 vector, 7 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

### day

- From `day.slide`.
- Layers: 10 shape, 4 vector, 7 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 90%         | none         |

### sponsors

- From `sponsors.slide`.
- Layers: 24 shape, 1 photo, 4 vector, 19 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 98%         | none         |

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 18 shape, 1 photo, 4 vector, 9 image, 34 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 96%         | none         |

Converter notes (from the raw conversion):

- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

### day

- From `day.slide`.
- Layers: 6 shape, 4 vector, 3 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 88%         | none         |
| story     | 90%         | none         |
| landscape | 89%         | none         |

## milestone

### card

- From `card.single`.
- Layers: 16 shape, 1 photo, 4 vector, 7 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

## newSigning

### card

- From `card.single`.
- Layers: 14 shape, 1 photo, 4 vector, 7 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)

## player

### card

- From `card.single`.
- Layers: 24 shape, 1 photo, 4 vector, 7 image, 42 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 99%         | none         |

Colours not tokenised:

- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.5)

## premiership

### card

- From `card.single`.
- Layers: 7 shape, 1 photo, 4 vector, 1 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×12)

## record

### card

- From `card.single`.
- Layers: 13 shape, 1 photo, 4 vector, 7 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 8 shape, 1 photo, 4 vector, 3 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 97%         | none         |

## weekendWrap

### card

- From `card.weekend-wrap`.
- Layers: 10 shape, 4 vector, 7 image, 18 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 83%         | none         |
| portrait  | 80%         | none         |
| story     | 86%         | none         |
| landscape | 90%         | none         |

Converter notes (from the raw conversion):

- inline runs styled apart, merged into one text style (×4)
