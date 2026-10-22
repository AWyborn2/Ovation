# Gold Foil: raw conversion report

Converted from the `gold-foil-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **raw conversion, unlisted**, pending designer polish and Ash's sign-off.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 89% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms; `hhShine` → loop: shine, 5500 ms.
- Colours that move with the palette but aren't a token: 7.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 0 hd (raw conversion).

## bigMoment

### card

- From `card.single`.
- Layers: 20 shape, 7 image, 36 text.
- Motion: `hhPulse` → loop: pulse, 1400 ms; `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 85% | none |
| portrait | 80% | none |
| story | 86% | none |
| landscape | 92% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.32)
- color color(srgb 0.875765 0.344941 0.534118)

## century

### card

- From `card.single`.
- Layers: 19 shape, 1 photo, 7 image, 34 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 89% | none |
| story | 92% | none |
| landscape | 95% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## clubLeaderboard

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 15 shape, 7 image, 20 text, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 90% | none |
| portrait | 88% | none |
| story | 92% | none |
| landscape | 93% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## countdown

### card

- From `card.single`.
- Layers: 16 shape, 7 image, 34 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 85% | none |
| story | 89% | none |
| landscape | 93% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## debut

### card

- From `card.single`.
- Layers: 16 shape, 1 photo, 7 image, 27 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 85% | none |
| portrait | 80% | none |
| story | 86% | none |
| landscape | 92% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## fiveFor

### card

- From `card.single`.
- Layers: 19 shape, 1 photo, 7 image, 36 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 88% | none |
| portrait | 85% | none |
| story | 90% | none |
| landscape | 94% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 16 shape, 1 photo, 7 image, 29 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 88% | none |
| story | 91% | none |
| landscape | 94% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## ladder

### card

- From `card.single`.
- Layers: 21 shape, 7 image, 66 text, 2 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 84% | none |
| portrait | 81% | none |
| story | 87% | none |
| landscape | 93% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- background-color color(srgb 0.288931 0.0676403 0.121744 / 0.782824)
- color color(srgb 0.875765 0.344941 0.534118)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.6)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.32)

## matchDay

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 23 shape, 9 image, 47 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 95% | none |
| portrait | 93% | none |
| story | 95% | none |
| landscape | 96% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

### title

- From `title.slide`.
- Layers: 18 shape, 1 photo, 7 image, 28 text.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 93% | none |
| portrait | 91% | none |
| story | 93% | none |
| landscape | 95% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

### day

- From `day.slide`.
- Layers: 15 shape, 7 image, 16 text, 4 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 87% | none |
| story | 89% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| landscape | 88% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

### sponsors

- From `sponsors.slide`.
- Layers: 21 shape, 1 photo, 7 image, 31 text, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 85% | none |
| portrait | 75% | none |
| story | 83% | none |
| landscape | 95% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.35)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 19 shape, 1 photo, 9 image, 40 text, 3 group; 1 stack group(s).
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 88% | none |
| portrait | 87% | none |
| story | 91% | none |
| landscape | 92% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

### day

- From `day.slide`.
- Layers: 11 shape, 3 image, 16 text, 4 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 90% | none |
| portrait | 86% | none |
| story | 88% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| landscape | 85% | none |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## milestone

### card

- From `card.single`.
- Layers: 19 shape, 1 photo, 7 image, 29 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 88% | none |
| portrait | 81% | none |
| story | 86% | none |
| landscape | 93% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## newSigning

### card

- From `card.single`.
- Layers: 17 shape, 1 photo, 7 image, 28 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 84% | none |
| portrait | 78% | none |
| story | 85% | none |
| landscape | 91% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## player

### card

- From `card.single`.
- Layers: 27 shape, 1 photo, 7 image, 43 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 88% | none |
| portrait | 83% | none |
| story | 88% | none |
| landscape | 93% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)
- background-color color(srgb 0.827451 0.0901961 0.352941 / 0.16)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.55)
- border-top-color color(srgb 0.827451 0.0901961 0.352941 / 0.32)

## premiership

### card

- From `card.single`.
- Layers: 10 shape, 1 photo, 1 image, 28 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 90% | none |
| portrait | 87% | none |
| story | 91% | none |
| landscape | 94% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## record

### card

- From `card.single`.
- Layers: 16 shape, 1 photo, 7 image, 30 text.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 86% | none |
| story | 90% | none |
| landscape | 95% | none |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 11 shape, 1 photo, 3 image, 21 text, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 93% | overflow |
| portrait | 93% | overflow |
| story | 95% | overflow |
| landscape | 95% | overflow |

Polish:

- filter sepia(0.8) not mapped (×4)
- filter contrast(1.2) not mapped (×4)
- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

## weekendWrap

### card

- From `card.weekend-wrap`.
- Layers: 15 shape, 7 image, 16 text, 4 rows.
- Motion: `hhShine` → loop: shine, 5500 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 90% | overflow |
| portrait | 86% | overflow; overflow |
| story | 90% | overflow; overflow |
| landscape | 94% | overflow |

Polish:

- background repeating-linear-gradient(135deg, color(srgb 0.827 not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.875765 0.344941 0.534118)

