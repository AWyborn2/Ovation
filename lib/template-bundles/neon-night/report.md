# Neon Night: conversion and polish report

Converted from the `neon-night-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **polished, pending Ash's sign-off**. The polish is applied by `scripts/src/lib/pack-convert/polish/`, so a re-conversion keeps it.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 93% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 20.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 1 hd.

## bigMoment

### card

- From `card.single`.
- Layers: 31 shape, 8 image, 33 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 97%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- color color(srgb 0.875765 0.344941 0.534118)

## century

### card

- From `card.single`.
- Layers: 24 shape, 1 photo, 8 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## clubLeaderboard

Polish applied:

- leaders.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 18 shape, 8 image, 20 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 93%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- rows leaders: row style top dropped (not a style this list has) (×3)

Colours not tokenised:

- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## countdown

### card

- From `card.single`.
- Layers: 21 shape, 8 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## debut

### card

- From `card.single`.
- Layers: 21 shape, 1 photo, 8 image, 24 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 88%         | none         |
| portrait  | 84%         | none         |
| story     | 89%         | none         |
| landscape | 93%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## fiveFor

### card

- From `card.single`.
- Layers: 24 shape, 1 photo, 8 image, 33 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 21 shape, 1 photo, 8 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 99%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 99%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## ladder

### card

- From `card.single`.
- Layers: 20 shape, 8 image, 38 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 88%         | none         |
| portrait  | 86%         | none         |
| story     | 90%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)

Colours not tokenised:

- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- background-color color(srgb 0.255098 0.0648208 0.172495 / 0.782824)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## matchDay

Polish applied:

- fixture: the round line prints the grade too (a core field the pack's card leaves out)
- sponsors: one 3-column logo grid (12 logos) in place of the pack's major / other tiers; 9 converted layers replaced

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 32 shape, 10 image, 46 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 97%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

### title

- From `title.slide`.
- Layers: 21 shape, 1 photo, 8 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 89%         | none         |
| portrait  | 88%         | none         |
| story     | 91%         | none         |
| landscape | 93%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)

### day

- From `day.slide`.
- Layers: 18 shape, 8 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 91%         | none         |
| portrait  | 85%         | none         |
| story     | 86%         | none         |
| landscape | 88%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)

Colours not tokenised:

- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

### sponsors

- From `sponsors.slide`.
- Layers: 24 shape, 1 photo, 8 image, 31 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 87%         | none         |
| portrait  | 81%         | none         |
| story     | 87%         | none         |
| landscape | 95%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 24 shape, 1 photo, 10 image, 38 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 96%         | none         |
| portrait  | 97%         | none         |
| story     | 98%         | none         |
| landscape | 96%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

### day

- From `day.slide`.
- Layers: 14 shape, 4 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 85%         | none         |
| story     | 85%         | none         |
| landscape | 87%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)

Colours not tokenised:

- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## milestone

### card

- From `card.single`.
- Layers: 24 shape, 1 photo, 8 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## newSigning

### card

- From `card.single`.
- Layers: 24 shape, 1 photo, 8 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 87%         | none         |
| portrait  | 82%         | none         |
| story     | 87%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## player

### card

- From `card.single`.
- Layers: 30 shape, 1 photo, 8 image, 42 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 86%         | none         |
| story     | 90%         | none         |
| landscape | 94%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## premiership

### card

- From `card.single`.
- Layers: 15 shape, 1 photo, 2 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 98%         | none         |
| story     | 99%         | none         |
| landscape | 97%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## record

### card

- From `card.single`.
- Layers: 21 shape, 1 photo, 8 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 98%         | none         |
| portrait  | 99%         | none         |
| story     | 99%         | none         |
| landscape | 98%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 14 shape, 1 photo, 4 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 89%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 92%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)

Colours not tokenised:

- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## weekendWrap

Polish applied:

- matches.outcome: drawn as a chip (4 rows layers)
- matches.gradeLabel: runs to the next cell (4 cells)
- matches.gradeLabel: font at most 0.34 of the cell's width
- matches.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.weekend-wrap`.
- Layers: 18 shape, 8 image, 18 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 83%         | none         |
| portrait  | 79%         | none         |
| story     | 85%         | none         |
| landscape | 89%         | none         |

Converter notes (from the raw conversion):

- background none not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- border-left-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-right-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- border-bottom-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- filter color(srgb 0.827451 0.0901961 0.352941 / 0.7)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
