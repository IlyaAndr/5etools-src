# Online draft sheet and PDF preview

`characterbuilder.html` is the first browser view of the reviewed species data.
It displays the six Forest Gnome/Fighter and Infernal Tiefling/Warlock examples
at levels 1, 3, and 5, and accepts existing v1 draft character JSON files.

## Run locally

From the repository root:

```sh
npm run serve:dev
```

Open `http://localhost:5050/characterbuilder.html`. The page uses native ES modules
and fetches local source JSON, so it must be served over HTTP rather than opened
directly as a `file://` document. Runtime examples live in the application module;
the page does not load test fixtures or require Foundry or application globals.

Choose an example or open a saved character file, then select **Print / Save PDF**.
Use A4 portrait, 100% scale, and disable browser headers and footers. The normal
examples produce a main sheet and a separate spell reference. Long imported notes
may add pages; they remain plain text and are not clipped to fit one page.

## Current scope

The sheet follows the compact A4 layout from the character-sheet skill: ability
and skill rows, save annotations, constant values, a combat strip, resources,
vitals, and a separate magic reference. Species values and Gnomish Cunning
annotations are populated from the reviewed catalog. All 18 skills are shown.
Known current and temporary HP are displayed from the imported session.

Final ability scores, save bonuses, maximum HP, AC, class features, and class
spells remain pending. Base scores are labeled separately; the renderer does
not treat them as final scores or infer class spell attacks and DCs from them.
Unfinished species choices remain visible without arbitrary defaults.

These examples intentionally choose **Intelligence for species magic**. The
Warlock class uses **Charisma** for its own magic. The 2024 species choice is
independent and may use Intelligence, Wisdom, or Charisma. This example tests
source independence and is not a build recommendation.

The view is read-only. Resource boxes are empty marks for pencil use; saved spent
counts are preserved in the document but do not fill paper marks. Editing HP,
using resources, rests, and browser persistence belong to the later tracker PR.

## Import behavior and safety

Import uses the existing document validator and reviewed species projector.
Unsupported versions, source pins, species, or choices produce an actionable
error and keep the previous successful preview. A new example selection cancels
an older pending file read. The imported-character placeholder cannot leave the
page stuck in a loading state.

Names, notes, and source descriptions are escaped. 5etools tags become readable
text, with reaction triggers, ritual metadata, concentration, components, and
higher-slot descriptions retained. Numeric class calculations are not added by
the text formatter. Inputs are not mutated.

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

The check covers all six examples, 390-pixel mobile layouts, A4 dimensions and
page counts, invalid imports, delayed file-read races, pending choices, escaped
HTML input, print-button behavior, and the full text of long notes in the PDF.
Desktop/mobile screenshots and PDF samples support visual review. Browser QA
is a local check; GitHub Actions runs module tests, JS/SCSS lint, and verifies
that the committed generated CSS matches its Sass source.
