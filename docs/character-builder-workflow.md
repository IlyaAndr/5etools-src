# Sequential pull request workflow

## Branches

- `main` is the repository's original default branch. This repository has no `master` branch.
- `character-builder` is the integration branch, created from the current `origin/main`.
- `character-builder-01-model` and subsequent feature branches contain small changes for one PR targeting `character-builder`.

Create each new feature branch from the updated `character-builder` after the previous PR is merged. Independent work may be prepared locally while a PR is under review; do not create stacks of dependent open PRs by default.

## Language

Use English for source code, identifiers, comments, error messages, tests, example fixtures, project documentation, commit messages, and PR titles and descriptions. Keep translated UI and sheet text in dedicated localization resources. Player-entered names and notes may use any language.

Preserve full original ability and spell descriptions from 5etools. Do not
shorten or paraphrase them. Source markup can be rendered as readable text or
HTML, and mechanics can be extracted as separate structured data for choices,
calculations, and trackers. Add print pages when necessary to keep the original
descriptions readable.

## Development cycle

1. Choose a small, complete outcome from the development plan and define the PR's scope.
2. Delegate implementation to a subagent working on the feature branch.
3. The main agent reviews the changes, runs appropriate checks, and resolves findings. Use a separate Sol agent for an independent review when useful.
4. Publish a PR targeting `character-builder`, describing the result, limitations, and validation. GitHub Actions runs the module checks.
5. Share the PR with the user for review. Feedback may be left on GitHub or in chat; the main agent addresses it in the same PR.
6. Merge only after explicit user approval. Keep auto-merge disabled. Do not update `main` as part of this cycle.

The main agent and subagents share one GitHub account. Record agent reviews in the PR description; do not submit a formal approval of the same account's own PR. The user can inspect Files changed, leave comments, and approve merging in chat.

## Initial PR sequence

1. **Character save format.** A versioned document, separation of build decisions and session state, strict JSON import validation, two incomplete examples, tests, and this review process. Full D&D calculations are outside this PR's scope.
2. **Data normalization and reference results.** A minimal catalog of required entities, reviewed additions, Gnome and Tiefling support, and expected results at levels 1/3/5 with calculation notes.
3. **Early online sheet and PDF.** Render reference results using the skill template and verify A4 output.
4. **Fighter creation.** Shared calculations and step-by-step choices.
5. **Magic and Warlock creation.** Spell sources, invocations, and casting options.
6. **Tracker and storage.** Session state editing, rests, local characters, and import/export using the existing document contract.
7. **Level advancement and editing.** Decision history and dependency validation.
8. **PHB 2024 species.** All ten species and their variants, following the dedicated section of the plan. Split this work into multiple PRs if needed.
9. **Remaining classes and levels.** Small PRs grouped by the families of mechanics described in the plan.

This sequence describes outcomes. Refine each PR's scope after reviewing the previous one to keep changes easy to review.

## Checks for the first module

```bash
npm ci
npx --no-install vet-eslint js/character-builder test/jest/character-builder
npm run test:character-builder
```

Run the full unit suite with `npm run test:unit -- --runInBand`. The development plan is in `docs/character-builder-development-plan.md`.
