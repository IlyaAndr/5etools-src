# Online draft sheet and PDF preview

`characterbuilder.html` composes independent species, background, origin-feat,
class, and equipment choices and displays calculated reference builds. Any
reviewed combination of the ten XPHB species, the Warlock or Fighter, and any of
the 16 XPHB backgrounds can be created; the Warlock is complete from level 1 to
20 for all four patrons, and the Fighter covers levels 1–5. The page also imports
and exports v1 character JSON files.

## Run locally

From the repository root:

```sh
npm run serve:dev
```

Open **Player → Character Builder** in the 5etools navigation, immediately below
**Stat Generator**, or open `http://localhost:5050/characterbuilder.html` directly.
The page uses native ES modules
and fetches local source JSON, so it must be served over HTTP rather than opened
directly as a `file://` document. Runtime examples live in the application module;
the page does not load test fixtures or require Foundry or application globals.

Pick one species, class, and background from the three lists, then select
**New character**; the lists sit on the left and the original 5etools blocks of
the current choice on the right — the race summary (creature type, size, speed)
and traits, the class Core Traits and Multiclassing blocks with its features by
level, and the background entry — so the options can be compared without leaving
the page. The **character name** sits above the lists and renames the current
character (and its sheet title) as you type. Edit a supported imported build, open
a saved character file, or import a reference build, then select **Print / Save PDF**.
Use A4 portrait, 100% scale, and disable browser headers and footers. A complete
build produces a main sheet and separate references. Full descriptions and
long imported notes may add pages; they are not clipped to fit one page.

## Current scope

The sheet follows the compact A4 layout from the character-sheet skill: ability
and skill rows, save annotations, combat values, resources, vitals, and separate
references. The model calculates ability scores, saving throws, skills, maximum
HP, AC, attacks, spellcasting values, and supported features from the selected
build. Gnomish Cunning is annotated alongside the relevant saving throws.
All 18 skills are shown. Known current and temporary HP are displayed from the
imported session.

The editors support every combination of the ten XPHB species, the Warlock or
Fighter, and any of the 16 XPHB backgrounds, including Champion and all four XPHB
Warlock patrons (Archfey, Celestial, Fiend, Great Old One), with the explicitly
listed options. The Warlock editor is complete for levels 1–20 and the Fighter
editor covers levels 1–5. They do
not offer every legal class, spell,
feat, equipment, or invocation choice. Choices and their validation use the same
reviewed catalog; skill associations come from 2024 `data/skills.json`, ability
names come from the site's existing parser, and class skills, hit dice, saving
throws, Weapon Mastery progression, Second Wind uses, background skills, and
background ability choices come from the original class and background records.
Warlock spell and invocation progression also uses those records, each
Mystic Arcanum slot at level 11/13/15/17 offers one level 6/7/8/9 Warlock spell
chosen from the reviewed catalog with its own once-per-Long-Rest free cast.
Contact Patron prepares Contact Other Plane from level 9 with its own free cast,
and Eldritch Master turns Magical Cunning into a full Pact Magic recovery at
level 20 instead of adding a second pool. Each
patron's expanded spell list is derived from its subclass record, patron innate
free casts and limited-use pools are tracked as resources, patron damage
resistances, condition immunities, and senses apply, and the temporary hit
points Dark One's Blessing, Celestial Resilience, and Create Thrall grant appear
beside the sheet's trackers with the trigger that grants them. Damage riders
that add a computed bonus on a trigger — the Celestial's Radiant Soul is the
first — render as their own calculated line with the amount, the damage types,
and the frequency, and riders that describe an effect instead of a number (the
Great Old One's Eldritch Hex, the Archfey's Bewitching Magic) render with their
trigger and text.
Equipment and
invocation choice lists use reviewed annotations; Warlock spell lists and Magic
Initiate cantrips come from the same 5etools filter expressions the site uses,
evaluated against the pinned spell files, and single spell selects offer the
site's filter search (`level=1 ritual`). An
imported build with missing or unsupported choices produces an incomplete draft
summary rather than invented statistics. Selections no longer available after a
level change remain visible until the player explicitly removes them. Choice
groups with at least eight options include a text filter; it narrows only the
displayed entries, keeps selected entries visible, and never changes the saved
decisions. New documents have unique IDs.

Base ability scores are chosen with three labelled method options, and each method
shows the controls that fit it. The standard array assigns each of 15, 14, 13, 12,
10, and 8 once by selection, listing only the values no other ability uses, so an
illegal combination cannot be entered. Point buy replaces typing with stepper
buttons that show each score's cost, disable a step that would pass 15 or the
27-point budget, and display a budget bar with points spent and left. Manual entry
keeps number fields in the 1–20 range, marks entries the method cannot accept
without coercing them, and leaves the sheet incomplete until they are fixed. The
first visit to a method starts from the scores already entered; after that each
method keeps its own entries, so switching between methods restores what was
already entered there instead of clearing it, and the totals update beside the
controls. Background ability increases are edited inside the same block, and the
combined scores (base, background, and the level 4 increase) are shown beside them.
A choice with exactly one legal option, such as a shared
spellcasting ability, is displayed as a fixed value with the reason instead of a
selector; imported values that differ remain selectable so they are never
silently replaced. Common is required for languages, is included automatically,
and is explained by the rules text; the player chooses two further Standard
languages. Rare languages are not offered yet.

Species, background, origin-feat, class, and equipment choices are supplied by
independent providers and composed by shared code. All 16 XPHB backgrounds are
reviewed: each brings its source ability list, two fixed skills, its tool (fixed,
or one of every reviewed artisan's tool, musical instrument, or gaming set), its
Origin feat, 50 GP, and its granted gear, and that gear never draws on the class
starting-gold budget. The ten XPHB Origin feats are annotated too; Magic Initiate
(Druid) and (Wizard) carry their own reviewed level-1 spell and free cast, and a
feat may declare a `proficiencyChoice` so Skilled, Crafter, and Musician offer
their skills and tools from the reviewed `rules.tools` catalog. The sheet
calculator applies
the same composition. Each class selects its own starting equipment package, and
the selected background adds its fixed gear independently, so changing a
background never changes the class package or its armor and weapons. Background
skills are removed from the class skill list, and species and feat spellcasting
abilities are limited to a shared ability when every source allows one. Imported
characters retain their explicit values, which remain visible beside the allowed
options.

A new Warlock chooses **Charisma** for class, species, and feat spells because all
three sources allow it, whichever reviewed species and background are selected.
Dwarf, Gnome, Halfling, Orc, and Tiefling are reviewed. Dwarf, Halfling, and Orc
have no lineage and no species spells, so they carry no species spellcasting
ability: the catalog treats a lineage, its spell group, and the species casting
ability as optional, allows a species without darkvision, and lets a species add
fixed damage resistances and a hit-point bonus per level (Dwarven Toughness).
Dragonborn and Goliath choose an ancestry whose lineage has no spell group: the
Dragonborn picks one of the five damage types and gains that resistance, and the
Goliath picks one of the six Giant Ancestries, which stays printed trait text.
Aasimar has no lineage: its species-wide spell group grants the Light cantrip on
Charisma, and its Necrotic and Radiant resistance comes from the fixed list.
Elf chooses one of three lineages and one Keen Senses skill; its High Elf lineage
also chooses a cantrip from the reviewed 20-cantrip Wizard list, because the
source record states that choice as a filter rather than a fixed spell.
Human chooses any skill (Skillful) and an Origin feat (Versatile). The species
feat slot renders the chosen feat and applies its own proficiency choice and,
for Magic Initiate, its own spellcasting ability, cantrips, level-1 spell, and
free cast, so all ten Origin feats are offered in that slot.
Their traits render as features on the sheet.
Imported characters retain their explicit choices; previously selected different
abilities remain visible and each source's values are displayed separately. A
completion sweep builds a whole Warlock from the editor's own reviewed
descriptors — levels 1 and 2 without a patron, and levels 3, 5, 9, 11, 14, 17,
19, and 20 for each of the four patrons — and requires a complete sheet with no
open questions in every case.
Species-only reference fixtures also verify that rules permit independent
choices.

When the supported species, class, and feat allow one common spellcasting
ability, an incomplete draft suggests it for unresolved choices. Each source
retains its own selection and resources; a choice already in a saved character
is never changed. When actual spellcasting profiles differ, the sheet shows the
relevant source-specific values. A shared profile is displayed only once on the
main sheet.

Reviewed feature-specific effects are stored in `rules/character-sheet.json`
and resolved by `rules/effects.js` using typed, validated operations and
source-qualified conditions. This covers the currently annotated features; it
is not a universal D&D rules engine. Class and option validation remain limited
to the reviewed coverage, and the effect annotations themselves are curated data
rather than automatically extracted rule text.

Ability Score Improvement slots at levels 4, 8, 12, and 16 also offer 31 reviewed
general feats. A feat's ability increase, armor and weapon training, and
blindsight or truesight are read from the pinned source record and applied; its
level, ability, spellcasting, and armor-proficiency prerequisites are enforced,
with the armor check starting from the class's training and adding the training
granted by earlier feats in the same build. At level 19 the slot becomes an Epic
Boon: the 12 XPHB boons and the general feats are offered, a boon's ability
increase may raise a score to 30, and its truesight reaches the sheet. Boon
effects that need conditional choices or rest-time state stay narrative text, and
feats that grant skill or tool proficiencies, saving throws, or spells are not
offered yet.

All 28 Eldritch Invocations of the pinned data are reviewed in
`rules/character-sheet.json` with their minimum Warlock level and, where the
source requires one, the prerequisite invocation. The editor and the sheet use
the same list, so an invocation is offered only when the level reaches its
minimum and its prerequisite is already selected; a saved dependent invocation
without its prerequisite leaves the sheet incomplete instead of being dropped.
Pact of the Tome and Lessons of the First Ones stay out of the selectable list
and name the reason beside the group, because the cantrips, rituals, and Origin
feat they grant have no reviewed choice yet. Repeatable invocations (Agonizing
Blast, Eldritch Spear, Repelling Blast, Lessons of the First Ones) can be taken
once, because indexed repeats are not represented in the build document. Sixteen
further invocations carry reviewed effect annotations: Eldritch Mind, Devil's
Sight, Armor of Shadows, and Agonizing Blast change calculated values; ten grant
their spell at will — Ascendant Step, Fiendish Vigor (False Life on yourself),
Mask of Many Faces, Master of Myriad Forms, Misty Visions, One with Shadows,
Otherworldly Leap, Pact of the Chain, Visions of Distant Realms, and Whispers of
the Grave — and Gift of the Depths adds a Swim Speed, underwater breathing, and
one free Water Breathing per Long Rest, while Witch Sight adds 30-foot Truesight.
The remaining invocations contribute their original description until their effects
are reviewed.

Pact of the Blade adds a Pact Weapon choice to the sheet. When the invocation is
selected, the editor offers the 28 reviewed Simple and Martial melee weapons from
`rules.pactWeapons`, and the sheet shows the chosen weapon as the primary attack,
rolling attack and damage with Charisma and full proficiency regardless of the
weapon's normal Strength or Finesse ability. Selecting the invocation without a
Pact Weapon leaves the sheet incomplete, while deselecting the invocation removes
the saved Pact Weapon and the choice disappears with it instead of lingering as an
unavailable group. Thirsting Blade adds a second Pact Weapon attack, and
Devouring Blade replaces that extra attack with two, so the Pact Weapon attack
shows 2 attacks with Thirsting Blade and 3 once Devouring Blade is selected.
Eldritch Smite adds its slot-fuelled Force damage to that same attack: the panel
prints the dice for the character's own Pact Magic slot level, so a level 5
Warlock with level 3 slots reads 4d8, and it names the Prone option for Huge or
smaller targets. All four invocations require Pact of the Blade, and the
features reference page prints that prerequisite under each entry. Lifedrinker
adds a once-per-turn rider to the same panel — 1d6 Necrotic, Psychic, or Radiant,
the damage type left to the player — and the Hit Dice tracker names the Hit
Point Die it can spend, reading the character's own Hit Die and Constitution
modifier, so a level 9 Warlock reads `Lifedrinker: expend one to regain 1d8 +2 HP
(minimum 1)`.

The editor changes build decisions and can export a JSON document. Ability scores
are stored only when all six are entered; partial score entries remain in the
open editor but cannot yet be represented in the saved format. The sheet itself
is read-only. Resource boxes are empty marks for pencil use; saved spent counts
are preserved in the document but do not fill paper marks. Editing HP, using
resources, rests, and browser persistence belong to the later tracker PR.

## Import behavior and safety

Import uses the existing document validator, reviewed species projector, and
limited character-sheet model. Invalid documents and unsupported source pins
produce an actionable error and keep the previous successful preview. Builds
requiring unsupported or unfinished choices show a draft summary. Starting
another character cancels an older pending file read. Importing never needs a
placeholder document to stay usable.

Names, notes, and source descriptions are escaped. Full ability and spell
descriptions must retain the original 5etools content, with tags rendered as
readable text and higher-slot descriptions included. Structured mechanics and
numeric class calculations are displayed separately as labeled values; text is
not rewritten or shortened. Resource recovery, healing, and casting data are
curated structured rules, not automatically parsed from the prose. Spell cards
identify their original source, page, and school. Source links and formatting
tags are currently displayed as readable plain text. Inputs are not mutated.

## Validation and review artifacts

```sh
npm run test:character-builder
npx --no-install vet-eslint js/character-builder test/jest/character-builder
npx --no-install stylelint scss/character-builder.scss
npm run build:character-builder-css
python3 test/browser/character-builder-preview.py
```

The browser check uses an already installed Python Playwright package and
Chrome/Chromium, plus `pdfinfo` and `pdftotext`. It starts a temporary server on
`127.0.0.1`, closes it afterward, and writes ignored review artifacts to
`scratch/character-builder-preview/`. It does not install browsers or packages.
Use `--browser /path/to/chrome` or `--output /path/to/artifacts` when needed.

The check covers desktop and mobile navigation, character creation and edits,
option filtering, JSON round-tripping, the six reference builds loaded through the import input, 390-pixel mobile
layouts, A4 dimensions and page counts, invalid imports, delayed file-read
races, pending choices, escaped HTML input, print-button behavior, and full long
notes in the PDF.
Desktop/mobile screenshots and PDF samples support visual review. Browser QA
is a local check; GitHub Actions runs module tests, JS/SCSS lint, and verifies
that the committed generated CSS matches its Sass source.
