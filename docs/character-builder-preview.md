# Online draft sheet and PDF preview

`characterbuilder.html` composes independent species, background, origin-feat,
class, and equipment choices and displays six calculated Forest Gnome/Fighter and
Infernal Tiefling/Warlock reference builds at levels 1, 3, and 5. Any reviewed
combination of Gnome or Tiefling, Fighter or Warlock, and Soldier or Acolyte can
be created. The page also imports and exports v1 character JSON files.

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

Select **New Fighter** or **New Warlock** for a reference preset, choose a
species, class, and background and select **New character** for another
combination, or edit a supported imported build.
Choose an example or open a saved character file, then select **Print / Save PDF**.
Use A4 portrait, 100% scale, and disable browser headers and footers. The normal
examples produce a main sheet and separate references. Full descriptions and
long imported notes may add pages; they are not clipped to fit one page.

## Current scope

The sheet follows the compact A4 layout from the character-sheet skill: ability
and skill rows, save annotations, combat values, resources, vitals, and separate
references. The model calculates ability scores, saving throws, skills, maximum
HP, AC, attacks, spellcasting values, and supported features from the selected
build. Gnomish Cunning is annotated alongside the relevant saving throws.
All 18 skills are shown. Known current and temporary HP are displayed from the
imported session.

The editors support every combination of Gnome or Tiefling, Fighter or Warlock,
and Soldier or Acolyte, including Champion and the Fiend patron, with the
explicitly listed options. The Warlock editor covers levels 1–20 and the Fighter
editor levels 1–5. They do not offer every legal class, spell,
feat, equipment, or invocation choice. Choices and their validation use the same
reviewed catalog; skill associations come from 2024 `data/skills.json`, ability
names come from the site's existing parser, and class skills, hit dice, saving
throws, Weapon Mastery progression, Second Wind uses, background skills, and
background ability choices come from the original class and background records.
Warlock spell and invocation progression also uses those records. Equipment,
spell, invocation, and origin-feat choice lists use reviewed annotations. An
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
independent providers and composed by shared code. The sheet calculator applies
the same composition. Each class selects its own starting equipment package, and
the selected background adds its fixed gear independently, so changing a
background never changes the class package or its armor and weapons. Background
skills are removed from the class skill list, and species and feat spellcasting
abilities are limited to a shared ability when every source allows one. Imported
characters retain their explicit values, which remain visible beside the allowed
options.

A new Warlock chooses **Charisma** for class, species, and feat spells because all
three sources allow it, whichever reviewed species and background are selected.
Imported characters retain their explicit choices; previously selected different
abilities remain visible and each source's values are displayed separately.
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
invocations carry reviewed effect annotations: Eldritch Mind, Devil's Sight,
Armor of Shadows, and Agonizing Blast change calculated values; ten grant their
spell at will — Ascendant Step, Fiendish Vigor (False Life on yourself), Mask of
Many Faces, Master of Myriad Forms, Misty Visions, One with Shadows, Otherworldly
Leap, Pact of the Chain, Visions of Distant Realms, and Whispers of the Grave —
and Gift of the Depths adds a Swim Speed, underwater breathing, and one free
Water Breathing per Long Rest, while Witch Sight adds 30-foot Truesight. The
remaining invocations currently contribute their original description until
their effects are reviewed.

Pact of the Blade adds a Pact Weapon choice to the sheet. When the invocation is
selected, the editor offers the 28 reviewed Simple and Martial melee weapons from
`rules.pactWeapons`, and the sheet shows the chosen weapon as the primary attack,
rolling attack and damage with Charisma and full proficiency regardless of the
weapon's normal Strength or Finesse ability. Selecting the invocation without a
Pact Weapon leaves the sheet incomplete, while deselecting the invocation removes
the saved Pact Weapon and the choice disappears with it instead of lingering as an
unavailable group. Thirsting Blade and Devouring Blade (extra attacks), Eldritch
Smite, and Lifedrinker are not yet calculated and keep their original descriptions
until their own effect annotations arrive.

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
requiring unsupported or unfinished choices show a draft summary. A new example
selection cancels an older pending file read. The current-character placeholder
cannot leave the page stuck in a loading state.

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
option filtering, JSON round-tripping, all six examples, 390-pixel mobile
layouts, A4 dimensions and page counts, invalid imports, delayed file-read
races, pending choices, escaped HTML input, print-button behavior, and full long
notes in the PDF.
Desktop/mobile screenshots and PDF samples support visual review. Browser QA
is a local check; GitHub Actions runs module tests, JS/SCSS lint, and verifies
that the committed generated CSS matches its Sass source.
