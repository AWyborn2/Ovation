# Neon Night: conversion and polish report

Converted from the `neon-night-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **polished, pending Ash sign-off**. The polish is applied by `scripts/src/lib/pack-convert/polish/`, so a re-conversion keeps it.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 91% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 10.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 1 hd.

## bigMoment

### card

- From `card.single`.
- Layers: 26 shape, 7 image, 33 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 85%         | none         |
| portrait  | 80%         | none         |
| story     | 86%         | none         |
| landscape | 91%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)
- color color(srgb 0.875765 0.344941 0.534118)

## century

### card

- From `card.single`.
- Layers: 23 shape, 1 photo, 7 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## clubLeaderboard

Polish applied:

- leaders.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 17 shape, 7 image, 20 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 89%         | none         |
| portrait  | 88%         | none         |
| story     | 91%         | none         |
| landscape | 92%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## countdown

### card

- From `card.single`.
- Layers: 20 shape, 7 image, 31 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 94%         | none         |
| portrait  | 89%         | none         |
| story     | 92%         | none         |
| landscape | 94%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## debut

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 7 image, 24 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 86%         | none         |
| portrait  | 81%         | none         |
| story     | 86%         | none         |
| landscape | 92%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## fiveFor

### card

- From `card.single`.
- Layers: 23 shape, 1 photo, 7 image, 33 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 20 shape, 1 photo, 7 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## ladder

### card

- From `card.single`.
- Layers: 23 shape, 7 image, 68 text, 2 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 84%         | none         |
| portrait  | 81%         | none         |
| story     | 87%         | none         |
| landscape | 92%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- background-color color(srgb 0.255098 0.0648208 0.172495 / 0.782824)
- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## matchDay

Polish applied:

- fixture: the round line prints the grade too (a core field the pack's card leaves out)
- sponsors: one 3-column logo grid (12 logos) in place of the pack's major / other tiers; 9 converted layers replaced

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 28 shape, 9 image, 46 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 97%         | none         |
| portrait  | 96%         | none         |
| story     | 97%         | none         |
| landscape | 97%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

### title

- From `title.slide`.
- Layers: 20 shape, 1 photo, 7 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 93%         | none         |
| portrait  | 90%         | none         |
| story     | 93%         | none         |
| landscape | 95%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)

### day

- From `day.slide`.
- Layers: 17 shape, 7 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 85%         | none         |
| story     | 86%         | none         |
| landscape | 87%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

### sponsors

- From `sponsors.slide`.
- Layers: 23 shape, 1 photo, 7 image, 31 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 86%         | none         |
| portrait  | 80%         | none         |
| story     | 86%         | none         |
| landscape | 95%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 23 shape, 1 photo, 9 image, 38 text, 3 group; 1 stack group(s).

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 90%         | none         |
| portrait  | 89%         | none         |
| story     | 93%         | none         |
| landscape | 93%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

### day

- From `day.slide`.
- Layers: 13 shape, 3 image, 16 text, 4 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 89%         | none         |
| portrait  | 85%         | none         |
| story     | 85%         | none         |
| landscape | 85%         | none         |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## milestone

### card

- From `card.single`.
- Layers: 23 shape, 1 photo, 7 image, 28 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 97%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## newSigning

### card

- From `card.single`.
- Layers: 23 shape, 1 photo, 7 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 85%         | none         |
| portrait  | 79%         | none         |
| story     | 85%         | none         |
| landscape | 91%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## player

### card

- From `card.single`.
- Layers: 29 shape, 1 photo, 7 image, 42 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 88%         | none         |
| portrait  | 84%         | none         |
| story     | 89%         | none         |
| landscape | 93%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## premiership

### card

- From `card.single`.
- Layers: 14 shape, 1 photo, 1 image, 27 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 94%         | none         |
| story     | 96%         | none         |
| landscape | 96%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## record

### card

- From `card.single`.
- Layers: 20 shape, 1 photo, 7 image, 29 text.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 95%         | none         |
| portrait  | 91%         | none         |
| story     | 94%         | none         |
| landscape | 97%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- color color(srgb 0.875765 0.344941 0.534118)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 13 shape, 1 photo, 3 image, 21 text, 3 rows.

| Size      | Pixel match | Fit warnings |
| --------- | ----------- | ------------ |
| square    | 92%         | none         |
| portrait  | 92%         | none         |
| story     | 94%         | none         |
| landscape | 95%         | none         |

Polish:

- background none not mapped (×4)
- filter contrast(1.3) not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)

## weekendWrap

Polish applied:

- matches.outcome: drawn as a chip (4 rows layers)
- matches.gradeLabel: left-aligned, so a long grade clips at its end

### card

- From `card.weekend-wrap`.
- Layers: 17 shape, 7 image, 18 text, 4 rows.

| Size      | Pixel match | Fit warnings       |
| --------- | ----------- | ------------------ |
| square    | 91%         | overflow; overflow |
| portrait  | 89%         | overflow; overflow |
| story     | 92%         | overflow; overflow |
| landscape | 94%         | overflow           |

Polish:

- background none not mapped (×4)
- filter drop-shadow(color(srgb 0.827451 0.0901961 0.352941 / 0.7) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- box-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.95)
- text-shadow color(srgb 0.827451 0.0901961 0.352941 / 0.55)
