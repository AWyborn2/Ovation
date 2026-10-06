# Ovation Social Studio — Caption Library 🏏

Captions for every card type in Social Studio (`CARD_KIND_OPTIONS` in
`artifacts/cricket-club/src/components/card-kind-picker.tsx`).

**How to read this**

- `{curly}` tokens are filled in by the composer automatically (`lib/scorecard/src/captions.ts`).
  Every card type now has tokens. A token the card has no value for comes out blank.
- `[square brackets]` are the few details no token covers yet (lists such as the top three, or a
  former club). Fill these in by hand.
- Each card has a **long** caption (Instagram / Facebook) and a **short** one (X, which allows 280 characters).
- `{hashtag}` is the club's own hashtag, and `{app.link}` links to that card's page in the app.

---

## 🏆 Achievement cards

### Milestone

_Shows the player's photo, the milestone tier and their total against the threshold._

**Long**

> 🚨 MILESTONE ALERT 🚨
>
> Raise the bat for {player.name}! 🏏👏
> {stat.value} {stat.label}. That's the {stat.tier} mark, and the scorers are sharpening their pencils for the next one ✏️
>
> Seasons of early starts, sweaty nets and cold tea, and it all adds up to this 🙌
>
> 📊 Full career numbers 👉 {app.link}
> {hashtag} #Milestone #CricketFamily

**Short**

> 🚨 {player.name} brings up {stat.value} {stat.label}. That's the {stat.tier} milestone 🏏👏 {app.link} {hashtag}

---

### Century 💯

_Shows the runs (with * for not out), balls faced, the opponent and the round._

**Long**

> 💯 TON UP! 💯
>
> Helmet off, bat raised, crowd on its feet 🙌
> {player.name} piles on {stat.value} in {grade.name} against {opponent.name} in {round.label} 🔥
>
> Every one of those {stat.threshold}+ runs had to be earned. Take a bow, champ 🎩🏏
>
> 📲 Scorecard 👉 {app.link}
> {hashtag} #Century #TonUp #Cricket

**Short**

> 💯 TON UP! {player.name} smashes {stat.value} for {grade.name} 🏏🔥 Helmet off, bat raised, take a bow 🎩 {app.link} {hashtag}

---

### Five-for 🎯

_Shows the bowling figures, overs, the opponent and the round._

**Long**

> 🎯 FIVE-FOR! 🎯
>
> {player.name} ran through them 💥
> Figures of {stat.value} in {grade.name} against {opponent.name} 🏏
>
> The ball's going home with them, and they've earned it 🔴✋
>
> 📲 Full scorecard 👉 {app.link}
> {hashtag} #FiveFor #Wickets #BowlersWinMatches

**Short**

> 🎯 {player.name} grabs a five-for! {stat.value} in {grade.name} 🔴💥 That ball's going home with them ✋ {app.link} {hashtag}

---

### Big Moment ⚡

_The live card: runs off balls, the boundary count, the score and the chase equation._

**Long**

> ⚡ BIG MOMENT ⚡
>
> {stat.tier}! {player.name} has {stat.value} 🔥
> [4s/6s detail] 🏏💥
>
> 📺 Score: [live score]
> 🧮 [Equation, e.g. 42 needed off 30]
>
> Get down to the ground, this one's going to the wire 😬🍿
> {hashtag} #CricketLive

**Short**

> ⚡ {player.name} has {stat.value} against {opponent.name} 🔥 [Equation] 😬 Get down here! {hashtag}

---

### Record 📜

_Shows the record's title, the holder, the figure and the grade._

**Long**

> 📜 FOR THE RECORD BOOKS 📜
>
> {player.name} holds the club record for {stat.label}: {stat.value} 🏆
> ({grade.name})
>
> Records are there to be broken... but good luck with this one 😅🏏
>
> 📖 Explore the club record book 👉 {app.link}
> {hashtag} #ClubRecord #CricketHistory

**Short**

> 📜 Club record: {stat.label}, {stat.value}, held by {player.name} 🏆 Who's having a crack at it? 🏏 {app.link} {hashtag}

---

### Premiership 🏆

_Shows the team photo, the season, the grade, the competition, the result and player of the match._

**Long**

> 🏆 PREMIERS 🏆
>
> {stat.value} {grade.name} champions 🥇🏏
> [Competition]. [Result]
>
> 🌟 Player of the Match: {player.name}
>
> Sing the club song loud! A flag that'll fly forever 🎶🚩
> 📖 Honour board 👉 {app.link}
> {hashtag} #Premiers #Champions #FlagWinners

**Short**

> 🏆 {stat.value} {grade.name} PREMIERS 🥇 Player of the Match: {player.name} 🌟 Flag secured 🚩 {app.link} {hashtag}

---

## 👤 Player cards

### Debut 🧢

_Shows the cap number, the grade, the season, the opponent and the round._

**Long**

> 🧢 WELCOME TO THE BIG TIME 🧢
>
> Congratulations to {player.name} on their {stat.tier}! 🎉
> Debuting in {stat.threshold} against {opponent.name}, {round.label} 🏏
>
> That number is theirs forever. Wear it with pride 💪
> {hashtag} #Debut #CapNumber #NextGen

**Short**

> 🧢 {player.name} receives {stat.tier}! Welcome to the big time 🎉🏏 {app.link} {hashtag}

---

### Player (Spotlight) 🔦

_Shows the photo, the grades played and a stat line (games, runs, wickets and so on)._

**Long**

> 🔦 PLAYER SPOTLIGHT 🔦
>
> Meet {player.name} 🏏
> 📋 Grades: {grade.name}
> 📊 {stat.value} {stat.label} for the club and counting
>
> Drop a 🏏 in the comments if you've shared a pitch with this legend 👇
> Full profile 👉 {app.link}
> {hashtag} #PlayerSpotlight

**Short**

> 🔦 Spotlight: {player.name}. {stat.value} {stat.label} and counting 🏏📊 {app.link} {hashtag}

---

### Trading Card 🃏

_A collectible card with a photo, role, cap number, season and a stat panel._

**Long**

> 🃏 COLLECT 'EM ALL 🃏
>
> Fresh off the press: {player.name} 🔥
> 🧢 {stat.tier} · 📅 {stat.threshold}
>
> 📊 {stat.value} {stat.label} and counting
>
> Who's next in the deck? Tag the teammate you want to see 👇
> {hashtag} #TradingCard #CricketCards

**Short**

> 🃏 New card just dropped: {player.name}, {stat.tier} 🔥 Who's next in the deck? 👇 {hashtag}

---

### New Signing ✍️

_Shows the player's first and last name, role, former club, season and photo._

**Long**

> ✍️ SIGNED, SEALED, DELIVERED ✍️
>
> Please welcome {player.name} to the club for {stat.threshold}! 🎉
> 🏏 {stat.label}
> 🔁 Joins from [Former Club]
>
> Pads are on, kit is ironed. Let's go 💪
> Show them some love in the comments 👇
> {hashtag} #NewSigning #WelcomeToTheClub

**Short**

> ✍️ NEW SIGNING: {player.name}, {stat.label} from [Former Club], joins for {stat.threshold} 🎉🏏 {hashtag}

---

## 📊 Stats & tables

### Leaderboard (grade leader) 🥇

_Shows the top player in a grade for runs or wickets._

**Long**

> 🥇 TOP OF THE CHARTS 🥇
>
> {player.name} leads {grade.name} for {stat.label} with {stat.value} 📈🏏
>
> Can anyone catch them? The race is on 🏃‍♂️💨
> 📊 Full leaderboard 👉 {app.link}
> {hashtag} #GradeLeader #Stats

**Short**

> 🥇 {player.name} leads {grade.name} for {stat.label} with {stat.value} 📈 Can anyone catch them? {app.link} {hashtag}

---

### Club Leaderboard 📈

_A season top-five for runs, wickets, catches or dismissals across the club._

**Long**

> 📈 {stat.tier}: {stat.threshold} 📈
>
> The club-wide top five is in 👀
> 🥇 {player.name} · {stat.value} {stat.label}
> 🥈 [Name] · [Value]
> 🥉 [Name] · [Value]
>
> Who's climbing next week? 🧗 Tag a mate who belongs on this list 👇
> {hashtag} #ClubLeaders #CricketStats

**Short**

> 📈 {stat.tier} {stat.threshold}: 🥇 {player.name} {stat.value} 🥈 [Name] 🥉 [Name]. The race is ON 🏏 {hashtag}

---

### Ladder 🪜

_A competition ladder table for one grade, "as of" a given round._

**Long**

> 🪜 LADDER CHECK 🪜
>
> {grade.name} ({round.label})
> We're sitting {stat.value}! 📍
>
> Every point matters from here. Finals fever is building 🌡️🏏
> Swipe for the full table ➡️
> {hashtag} #Ladder #FinalsRace

**Short**

> 🪜 Ladder check: {grade.name} sits {stat.value}, {round.label} 📍 Finals fever is building 🌡️🏏 {hashtag}

---

## 📅 Match day & results

### Countdown ⏳

_Shows the number of days to go, the event, two hype lines, the date and venue, and the fixture._

**Long**

> ⏳ {stat.value} {stat.label} ⏳
>
> {stat.tier} is almost here! 🔥
> [Hype line 1]
> [Hype line 2]
>
> 📍 {venue}
> 🏏 [Fixture]
>
> Lock it in the calendar 📆👇
> {hashtag} #Countdown

**Short**

> ⏳ {stat.value} DAYS until {stat.tier}! 🔥 📍 {venue} Lock it in 📆🏏 {hashtag}

---

### Match Day 📣

_Shows the round, the opposition and their logo, home or away, the venue, date and start time, and a note._

**Long**

> 📣 IT'S MATCH DAY 📣
>
> {round.label} · we're taking on {opponent.name} 🏏
> 📍 {venue}
> 🗓️ {date} · ⏰ {stat.value}
>
> [Note, e.g. "BBQ fired up from 12" 🌭]
> Bring the noise and bring a chair 🪑🔊
> {hashtag} #MatchDay

**Short**

> 📣 MATCH DAY! {opponent.name} at {venue}, first ball {stat.value} 🏏 Bring the noise 🔊 {hashtag}

---

### Game Day (Round Fixtures) 🗓️

_Lists every grade's opponent, venue and start time for one round._

**Long**

> 🗓️ GAME DAY: {round.label} 🗓️
>
> {stat.value} {stat.label} on {date} 🏏🏏🏏
> Find your team, grab a coffee ☕ and get behind them 👇
>
> Swipe ➡️ for every fixture, venue and start time
> {hashtag} #GameDay #RoundFixtures

**Short**

> 🗓️ Game Day, {round.label}: {stat.value} {stat.label} on {date}. Fixtures, venues and times in the pic 👇🏏 {hashtag}

---

### Team List 📋

_Shows the named XI for one grade, with the round, competition, venue and time, and a squad photo._

**Long**

> 📋 TEAM NEWS 📋
>
> Your {grade.name} XI 🏏
> 📍 {venue}
>
> Pads packed? Whites washed? 🧺 Good luck to the boys and girls! 💪
> {hashtag} #TeamList #SelectionNight

**Short**

> 📋 TEAM NEWS: here's the {grade.name} XI 🏏 {venue}. Good luck, team 💪 {hashtag}

---

### Round Team Lists 🧾

_A carousel set with every grade's XI for the round, one slide per side._

**Long**

> 🧾 SELECTIONS ARE IN 🧾
>
> All {stat.value} {stat.label}, every name, {round.label} · {date} 🏏
> Swipe ➡️ to find your side
>
> Can't make it? Tell your captain now, not at 9am Saturday 😅⏰
> {hashtag} #Selections #TeamLists

**Short**

> 🧾 All {round.label} team lists are out! Swipe to find your side ➡️🏏 {hashtag}

---

### Match Summary 📝

_Shows the result, both teams' scores, the top performers from each innings, the venue and the date._

**Long**

> 📝 MATCH REPORT 📝
>
> {grade.name} against {opponent.name}
> 🏁 {stat.value}
>
> 🏏 Top bats: [Name] [runs], [Name] [runs]
> 🎯 Top ball: [Name] [figures]
>
> Full scorecard and every boundary 👉 {app.link}
> {hashtag} #MatchReport #Scorecard

**Short**

> 📝 {grade.name}: {stat.value} 🏁 Top performers on the card 🏏🎯 {app.link} {hashtag}

---

### Weekend Wrap 🌯

_A carousel set with every grade's result across a round's weekend._

**Long**

> 🌯 THE WEEKEND WRAP 🌯
>
> {round.label} · {date}
> Every result, all in one place 🏏
>
> ✅ Wins · ❌ Losses · 🤝 Draws, all inside ➡️
> Who starred for your side? Shout them out below 👇
> {hashtag} #WeekendWrap #Results

**Short**

> 🌯 Weekend Wrap, {round.label}: every grade's result in one swipe ➡️🏏 Who starred? 👇 {hashtag}

---

## 🔄 Whole-round drafts: built-in variations

When Game Day, Team Lists or the Weekend Wrap are set to **Whole round** (Social queue → Round
cards), each round's draft is captioned automatically from a pool of five variations. A different
one is picked each round, so the weekly post never reads the same twice, and a refresh keeps the
round's pick. Edit a draft's caption and it stays yours.

The variations live in `ROUND_SET_CAPTIONS`
(`artifacts/api-server/src/lib/social-cards-helpers.ts`). Junior rounds use the same pools, so
every line works for any age group. Weekend Wrap variations never quote the win count, so a
winless round still reads well.

---

## 🌱 Juniors

### Junior Highlights ⭐

_Shows standout junior performances for one grade and round: name, note and figure._

> Keep junior posts about encouragement, not records. They only use junior data, so don't mix in senior stats.

**Long**

> ⭐ JUNIOR STARS ⭐
>
> {grade.name} · {round.label} 🌱🏏
> So proud of our young cricketers this week!
>
> 🌟 {player.name}: {stat.label} ({stat.value})
> 🌟 [Name]: [note] ([figure])
> 🌟 [Name]: [note] ([figure])
>
> The future's bright in the nets 😎☀️
> Parents, drop a 👏 for the kids below!
> {hashtag} #JuniorCricket #FutureStars

**Short**

> ⭐ Junior Stars, {grade.name} {round.label}: huge efforts from {player.name} and the crew 🌱🏏👏 {hashtag}

---

## 🎨 Bonus: design pack launch posts

Social Studio comes with six looks. Use these to tease a new pack switch.

| Pack                  | Caption                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **Club Kit** 👕       | Our colours, our crest, our cards. Club Kit is the look of the club, on every post 👕🏏   |
| **Bold Type** 🔠      | BIG NUMBERS. BIG NAMES. BIG CRICKET. Bold Type has landed 🔠💥                            |
| **Broadcast Dark** 📺 | Lights, camera, cover drive 📺 Our cards just got the TV treatment with Broadcast Dark 🎬 |
| **Metallic Foil** ✨  | Shiny! ✨ Metallic Foil is for the moments worth framing: tons, five-fors and flags 🏆    |
| **Neon Night** 🌃     | Twilight T20 vibes 🌃⚡ Neon Night lights up the feed                                     |
| **Sunset** 🌅         | Golden hour at the ground 🌅🏏 Last session, long shadows. Sunset is here                 |
