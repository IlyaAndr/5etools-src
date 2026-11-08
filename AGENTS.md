# Character builder contributions

- Use English for all new character-builder source code, identifiers, comments, error messages, tests, example fixtures, documentation, commit messages, and PR titles and descriptions.
- Keep UI and sheet translations in dedicated localization resources. Player-entered names and notes may use any language.
- Preserve the full original 5etools descriptions of abilities and spells. Do not shorten, paraphrase, or rewrite them; render source markup faithfully and add pages when needed. Extract structured mechanics for calculations, choices, and trackers separately from the original descriptions.
- Follow the development and review process in `docs/character-builder-workflow.md` and the roadmap in `docs/character-builder-development-plan.md`.
- Use a Sol model for independent agent reviews.
- Target `character-builder` with small feature PRs. Merge only after explicit user approval; keep auto-merge disabled.
- Follow the repository's ES module and tab-indentation conventions. Run checks appropriate to the changed module.
