# Online draft sheet and PDF preview

`characterbuilder.html` includes Gnome/Fighter and Tiefling/Warlock editors and displays six
calculated Forest Gnome/Fighter and Infernal Tiefling/Warlock reference builds
at levels 1, 3, and 5. It also imports and exports v1 character JSON files.

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

Select **New Fighter** or **New Warlock** to build a character, or edit a supported imported build.
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

The editors support Gnome / Soldier / Fighter and Tiefling / Acolyte / Warlock,
including Champion and the Fiend patron, with the explicitly listed level 1–5
options. They do not offer every legal class, spell, feat, equipment, or invocation
choice. Choices and their validation use the same reviewed
catalog; skill associations come from 2024 `data/skills.json`, ability names
come from the site's existing parser, and Fighter skills, hit die, saving throws,
Weapon Mastery progression, Second Wind uses, and Soldier skill and ability
choices come from the original class and background records. Warlock skill choices,
Acolyte skill and ability choices, and the Warlock spell and invocation progression
also use those records. Equipment and the supported spell and invocation lists still
use reviewed annotations. An imported build with missing or
unsupported choices produces an incomplete draft summary rather than invented
statistics. Selections no longer available after a level change remain visible
until the player explicitly removes them. New documents have unique IDs.

Class and background source records are resolved independently of species. The
sheet calculator also checks Gnome / Warlock / Acolyte and Tiefling / Fighter /
Soldier combinations, but the editor does not yet offer species or background
switching. Some other combinations lack a reviewed equipment package and remain
incomplete. Further editor expansion requires composable species, class,
background and feat choice providers and independent equipment selection.

The Tiefling/Warlock editor chooses **Charisma** for class, species, and feat
spells because all three sources allow it. Imported characters retain their
explicit choices; previously selected different abilities remain visible and each
source's values are displayed separately. Species-only reference fixtures also
verify that rules permit independent choices.

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
to the supported reference profiles, and the effect annotations themselves are
curated data rather than automatically extracted rule text.

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
JSON round-tripping, all six examples, 390-pixel mobile layouts, A4 dimensions
and page counts, invalid imports, delayed file-read races, pending choices,
escaped HTML input, print-button behavior, and full long notes in the PDF.
Desktop/mobile screenshots and PDF samples support visual review. Browser QA
is a local check; GitHub Actions runs module tests, JS/SCSS lint, and verifies
that the committed generated CSS matches its Sass source.
