# Bold Type: raw conversion report

Converted from the `bold-type-v1` pack by `scripts/src/convert-pack.ts` on 2026-10-22. Status: **raw conversion, unlisted**, pending designer polish and Ash's sign-off.

## Summary

- Kinds: 17; pages: 21.
- Mean pixel match against the pack: 88% over 84 renders.
- Pixel match compares the pack and the converted page drawing the same sample input; sample photos and logos are grey placeholders in both.
- Motion: `hhPulse` → loop: pulse, 1400 ms.
- Colours that move with the palette but aren't a token: 8.
- Results set vs Match Summary: the same layout apart from the performers block.
- Validation: every document passes the template validator.
- Polish time logged: 0 hd (raw conversion).

## bigMoment

### card

- From `card.single`.
- Layers: 15 shape, 37 text, 7 image.
- Motion: `hhPulse` → loop: pulse, 1400 ms.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 87% | none |
| portrait | 82% | none |
| story | 87% | none |
| landscape | 92% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## century

### card

- From `card.single`.
- Layers: 15 shape, 35 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 89% | none |
| portrait | 87% | none |
| story | 92% | none |
| landscape | 93% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

## clubLeaderboard

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 10 shape, 20 text, 7 image, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 89% | none |
| portrait | 88% | none |
| story | 91% | none |
| landscape | 93% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)

Colours not tokenised:

- color color(srgb 0.879216 0.363137 0.547059)
- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## countdown

### card

- From `card.single`.
- Layers: 11 shape, 35 text, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 93% | none |
| portrait | 89% | none |
| story | 92% | none |
| landscape | 95% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

## debut

### card

- From `card.single`.
- Layers: 12 shape, 28 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 80% | none |
| portrait | 78% | none |
| story | 86% | none |
| landscape | 85% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## fiveFor

### card

- From `card.single`.
- Layers: 15 shape, 37 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 89% | none |
| portrait | 88% | none |
| story | 92% | none |
| landscape | 92% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×8)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## gradeLeader

### card

- From `card.Runs`; not used: `card.Wickets`.
- Layers: 12 shape, 29 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 88% | none |
| portrait | 85% | none |
| story | 91% | none |
| landscape | 90% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## ladder

### card

- From `card.single`.
- Layers: 16 shape, 68 text, 7 image, 2 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 85% | none |
| portrait | 81% | none |
| story | 87% | none |
| landscape | 93% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)

Colours not tokenised:

- color color(srgb 0.861961 0.272157 0.482353)
- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)
- border-top-color color(srgb 1 1 1 / 0.6)

## matchDay

### fixture

- From `fixture.single`; not used: `fixture.slide`.
- Layers: 18 shape, 48 text, 9 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 96% | none |
| portrait | 95% | none |
| story | 97% | none |
| landscape | 97% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- clubLogo: cropped to fill (object-fit: cover), drawn contained (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

### title

- From `title.slide`.
- Layers: 14 shape, 30 text, 2 photo, 7 image, 8 group; 2 stack group(s).

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 83% | none |
| portrait | 82% | none |
| story | 88% | none |
| landscape | 86% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

### day

- From `day.slide`.
- Layers: 10 shape, 18 text, 7 image, 4 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 91% | none |
| portrait | 86% | none |
| story | 89% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| landscape | 88% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)

Colours not tokenised:

- color color(srgb 0.879216 0.363137 0.547059)
- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

### sponsors

- From `sponsors.slide`.
- Layers: 17 shape, 33 text, 2 photo, 7 image, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 77% | none |
| portrait | 72% | none |
| story | 82% | none |
| landscape | 86% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- border-top-color color(srgb 1 1 1 / 0.22)

## matchSummary

### result

- From `result.single`; not used: `result.slide`.
- Layers: 14 shape, 40 text, 9 image, 3 group; 1 stack group(s).

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 89% | none |
| portrait | 90% | none |
| story | 93% | none |
| landscape | 93% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- opposition.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- club.logo: cropped to fill (object-fit: cover), drawn contained (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

### day

- From `day.slide`.
- Layers: 6 shape, 18 text, 3 image, 4 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 90% | none |
| portrait | 85% | none |
| story | 88% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| landscape | 85% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)

Colours not tokenised:

- color color(srgb 0.879216 0.363137 0.547059)
- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

## milestone

### card

- From `card.single`.
- Layers: 15 shape, 30 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 87% | none |
| portrait | 85% | none |
| story | 90% | none |
| landscape | 92% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

## newSigning

### card

- From `card.single`.
- Layers: 13 shape, 26 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 79% | none |
| portrait | 77% | none |
| story | 85% | none |
| landscape | 87% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## player

### card

- From `card.single`.
- Layers: 23 shape, 44 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 83% | none |
| portrait | 81% | none |
| story | 88% | none |
| landscape | 88% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)
- background-color color(srgb 1 1 1 / 0.16)
- border-top-color color(srgb 1 1 1 / 0.55)

## premiership

### card

- From `card.single`.
- Layers: 6 shape, 29 text, 2 photo, 1 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 87% | none |
| portrait | 87% | none |
| story | 92% | none |
| landscape | 90% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)
- inline runs styled apart, merged into one text style (×12)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## record

### card

- From `card.single`.
- Layers: 12 shape, 29 text, 2 photo, 7 image.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 87% | none |
| portrait | 85% | none |
| story | 91% | none |
| landscape | 91% | none |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## teamList

### team

- From `team.single`; not used: `team.slide`.
- Layers: 7 shape, 23 text, 2 photo, 3 image, 3 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 89% | overflow |
| portrait | 91% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| story | 94% | overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow; overflow |
| landscape | 92% | overflow |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- filter contrast(1.15) not mapped (×4)

Colours not tokenised:

- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)
- color color(srgb 1 1 1 / 0.7)

## weekendWrap

### card

- From `card.weekend-wrap`.
- Layers: 10 shape, 18 text, 7 image, 4 rows.

| Size | Pixel match | Fit warnings |
| --- | --- | --- |
| square | 92% | overflow |
| portrait | 89% | overflow; overflow |
| story | 92% | overflow; overflow |
| landscape | 95% | overflow |

Polish:

- outlined text drawn as a faint fill (no text stroke in v2) (×4)
- inline runs styled apart, merged into one text style (×4)

Colours not tokenised:

- color color(srgb 0.879216 0.363137 0.547059)
- -webkit-text-stroke-color color(srgb 1 1 1 / 0.22)

