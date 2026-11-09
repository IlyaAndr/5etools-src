# Online draft sheet and PDF preview

`characterbuilder.html` displays six calculated Forest Gnome/Fighter and
Infernal Tiefling/Warlock reference builds at levels 1, 3, and 5. It also
accepts existing v1 draft character JSON files.

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

This is a limited prototype for the represented class, subclass, species,
background, equipment, feat, and invocation choices; it is not a general
character creation interface. An imported build with missing or unsupported
choices produces an incomplete draft summary instead of a calculated complete
sheet. No choice is filled in with an arbitrary default.

The Tiefling/Warlock examples use **Charisma** for class, species, and feat
spells because all three sources allow it. Imported characters retain their
explicit choices; if their sources use different abilities, each source's values
are displayed separately. Species-only reference fixtures also verify that
rules permit independent choices.

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

The view is read-only. Resource boxes are empty marks for pencil use; saved spent
counts are preserved in the document but do not fill paper marks. Editing HP,
using resources, rests, and browser persistence belong to the later tracker PR.

## Import behavior and safety

Import uses the existing document validator, reviewed species projector, and
limited character-sheet model. Invalid documents and unsupported source pins
produce an actionable error and keep the previous successful preview. Builds
requiring unsupported or unfinished choices show a draft summary. A new example
selection cancels an older pending file read. The imported-character placeholder
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

The check covers desktop and mobile navigation, all six examples, 390-pixel
mobile layouts, A4 dimensions and
page counts, invalid imports, delayed file-read races, pending choices, escaped
HTML input, print-button behavior, and the full text of long notes in the PDF.
Desktop/mobile screenshots and PDF samples support visual review. Browser QA
is a local check; GitHub Actions runs module tests, JS/SCSS lint, and verifies
that the committed generated CSS matches its Sass source.
