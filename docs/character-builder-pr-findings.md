# Character Builder: closed-PR review and findings

Review of every merged pull request on the `character-builder` branch, from #1 to #51,
checked one by one against the current implementation on 2026-11-13.

**Method.** Each PR body was read in order and its recorded limitation, known gap, or
review note was extracted. Each finding was then re-checked against the current source,
`rules/character-sheet.json`, `rules/species.json`, the tests, and the docs. A finding is
*resolved* when a later PR removed the limitation, *accepted* when the project deliberately
keeps the behaviour, and *open* when it is still true and fixable.

## Findings (open, accepted, and deferred)

| Finding | Detail | Status | Action |
| --- | --- | --- | --- |
| F1: stale coverage text | `rules/character-sheet.json` still said "remaining patron features that need conditional or rest-time choices stay incomplete" after the patrons were finished in #47 and #48. | Fixed here | Reworded to name the Great Old One’s Psychic Spells rider as the one narrative patron item. |
| F2: dead withheld/unsupported plumbing | The `unsupported` invocation field and the `withheld` field on invocation and species `featChoice` had no consumer after #37 and #43. | Fixed here | Removed the runtime branches, the validation keys, and the `featWithheld` projection from `warlock-choices.js`, `character-sheet-model.js`, `species-catalog.js`, and `species-choices.js`. |
| F3: latent prerequisite gap | `feat-choices.js` documents that weapon and skill/tool proficiency prerequisites are unsupported. | Accepted | No reviewed XPHB feat uses one; all five proficiency prerequisites (Heavily Armored, Heavy Armor Master, Medium Armor Master, Moderately Armored, Shield Master) are armor. Kept as an explicit guard so a future source change fails loudly. |
| F4: narrative-only riders | Epic Boon riders other than the ability increase and truesight, and the Great Old One’s Psychic Spells rider, are not modelled. | Accepted | Their full source text still prints on the reference pages; recorded in the completion status table. |
| F5: two Magic Initiate code paths | The background feat uses `initiateSpell`/`initiateAbility`, while the species and invocation feat slots use `featSpells`. | Deferred | Both paths produce the same sheet; unifying them is a risk-only refactor, so it is recorded rather than bundled into a fix. |
| F6: prototype-era statements | PR #2 bypasses the upstream Abyssal 120-foot Darkvision with the verified 60-foot value; PR #3/#6 said the builder was not yet universal. | Accepted | The Darkvision bypass is a data caveat; "not yet universal" is still accurate because only two classes are reviewed. |

## Per-PR review

| PR | Title | Finding recorded | Status now |
| --- | --- | --- | --- |
| #1 | versioned character document | Sheet values stay outside the save by design; catalog resolution and calculations were still planned. | Design kept. Calculation arrived in #3; the save format is unchanged. |
| #2 | normalize species rules and spell grants | Coverage was `species-only`; the upstream Abyssal 120-foot Darkvision entry is bypassed with the verified 60-foot value. | Species-only coverage ended with #3+. The Darkvision bypass is a deliberate data caveat. |
| #3 | calculated sheets and complete source references | Only two reference builds; preview was read-only; validation limited to the reference profiles. | Any reviewed species/background/class combination is now buildable; the sheet is still print-only by design. |
| #4 | create Gnome Fighters | Editor covered only the Gnome/Soldier/Fighter subset. | Resolved: the editor covers every reviewed species, background, and class. |
| #5 | create Tiefling Warlocks | Editor covered only the Tiefling/Acolyte/Warlock subset. | Resolved: same editor as #4, now through Warlock level 20. |
| #6 | compose independent choices | Not yet a universal character builder; validation limited to supported profiles. | Accepted scope: two classes are reviewed (Warlock 1-20, Fighter 1-5). |
| #7 | fix editor choice correctness | Review findings were fixed in the PR; none left open. | No open finding. |
| #8 | filter long option lists | None recorded. | No open finding. |
| #9 | complete editor review follow-ups | The editor review table was the finding list; every row is marked fixed by #9. | All rows remain fixed and are covered by browser assertions. |
| #10 | extend the Warlock sheet to level 20 | Most patron and high-level features were still unimplemented. | Resolved by #11-#48. |
| #11 | gate every reviewed Eldritch Invocation | One invocation stayed withheld because its choice was not reviewed. | Resolved by #37; the withholding mechanism itself is removed by this PR (F2). |
| #12 | grant the at-will invocation spells | None recorded. | No open finding. |
| #13 | swim speed, truesight, and Fiendish Vigor | None recorded. | No open finding. |
| #14 | Pact of the Blade with a Charisma Pact Weapon | None recorded. | No open finding. |
| #15 | Pact Weapon extra attacks | None recorded. | No open finding. |
| #16 | Eldritch Smite on the Pact Weapon attack | None recorded. | No open finding. |
| #17 | Lifedrinker on the Pact Weapon attack | None recorded. | No open finding. |
| #18 | catalog-driven spell lists and all four patrons | Expanded lists and innate casts existed, but patron features were still missing. | Resolved by #19-#22, #42, #44, #47, #48. |
| #19 | track patron innate free casts as resources | None recorded. | No open finding; a later fix (#44) corrected the Charisma-keyed use count. |
| #20 | apply patron damage resistances | Only fixed resistances were applied. | Resolved; Fiendish Resilience (#42) added the chosen type. |
| #21 | add patron limited-use resource pools | None recorded. | No open finding. |
| #22 | apply patron condition immunity and telepathy | None recorded. | No open finding. |
| #23 | unlock Pact of the Tome cantrips and rituals | None recorded. | No open finding. |
| #24 | grant Ability Score Improvement at levels 4/8/12/16 | None recorded. | No open finding. |
| #25 | offer reviewed general feats in the feat slots | Only a first batch of feats was offered. | Resolved by #26, #35, #38-#41 (all 42). |
| #26 | expand general feats and enforce prerequisites | Weapon and skill/tool proficiency prerequisites stay unsupported. | Latent guard: no XPHB feat uses one (only armor). Kept as a rail (F3). |
| #27 | apply feat armor, weapon, and sense training | None recorded. | No open finding. |
| #28 | enforce feat armor-proficiency prerequisites | None recorded. | No open finding. |
| #29 | add the level-19 Epic Boon slot | Boon effects other than the ability increase stay narrative. | Still true and accepted (F4). |
| #30 | review all backgrounds and Origin feats | Lessons of the First Ones still waited for its Origin-feat choice. | Resolved by #37. |
| #31 | review Dwarf, Halfling, and Orc | None recorded. | No open finding. |
| #32 | review Dragonborn and Goliath ancestries | None recorded. | No open finding. |
| #33 | review the Aasimar and species-wide cantrips | None recorded. | No open finding. |
| #34 | review the Elf with a cantrip choice and species skill | None recorded. | No open finding. |
| #35 | add the proficiency-granting general feats | None recorded. | No open finding. |
| #36 | review the Human with a species feat slot | The three Magic Initiate variants stayed withheld in the species slot. | Resolved by #43. |
| #37 | offer Lessons of the First Ones with an Origin feat slot | Nine Origin feats; Magic Initiate still withheld; the `unsupported` invocation mechanism stayed as dead weight. | Magic Initiate resolved by #43; the dead mechanism is removed by this PR (F2). |
| #38 | add Resilient and Skill Expert | Remaining list pointed at Magic Initiate in the extra slots. | Resolved by #43. |
| #39 | add Telekinetic and Telepathic | Remaining list pointed at Magic Initiate in the extra slots. | Resolved by #43. |
| #40 | add Fey-Touched and Shadow-Touched | Remaining list pointed at Magic Initiate in the extra slots. | Resolved by #43. |
| #41 | add Ritual Caster | Background-feat spell slot not generalised, so Magic Initiate stayed withheld. | Spell choices resolved by #43 (F5 records the two remaining code paths). |
| #42 | apply the Fiend's Fiendish Resilience | Magic Initiate still withheld in the extra slots. | Resolved by #43. |
| #43 | carry Magic Initiate through the extra feat slots | Known deliberate non-generalisation: the background feat's spell slot uses `initiateSpell`/`initiateAbility` while extra slots use `featSpells`. | Still two code paths, no behavioural gap; deferred as F5. |
| #44 | track patron rest and triggered features | Remaining patron features needed models. | Resolved by #47 and #48. |
| #45 | choose Mystic Arcanum spells | None recorded. | No open finding. |
| #46 | add Contact Patron and Eldritch Master | None recorded. | No open finding. |
| #47 | show the Celestial Radiant Soul damage rider | None recorded. | No open finding. |
| #48 | finish the patron spell riders | None recorded. | No open finding. |
| #49 | prove the Warlock completes from level 1 to 20 | Narrative-only Epic Boon riders remain; Fighter still 1-5. | Accepted and documented in #50 (F4/F6). |
| #50 | record the Warlock completion in the docs | Recorded the narrative-only gaps; no new defect. | No open finding. |
| #51 | polish the printed sheet | None recorded. | No open finding. |

## Summary

- 51 PRs reviewed; 6 findings remain worth tracking (F1-F6).
- 2 are fixed by this PR (F1, F2).
- 4 are accepted or deferred with a stated reason (F3-F6).
- Every other limitation recorded by a PR was resolved by a later PR in the series.
