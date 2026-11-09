# Character builder contributions

- Use English for all new character-builder source code, identifiers, comments, error messages, tests, example fixtures, documentation, commit messages, and PR titles and descriptions.
- Keep UI and sheet translations in dedicated localization resources. Player-entered names and notes may use any language.
- Preserve the full original 5etools descriptions of abilities and spells. Do not shorten, paraphrase, or rewrite them; render source markup faithfully and add pages when needed. Extract structured mechanics for calculations, choices, and trackers separately from the original descriptions.
- Follow the development and review process in `docs/character-builder-workflow.md` and the roadmap in `docs/character-builder-development-plan.md`.
- Put feature-specific mechanics and conditions in reviewed, source-qualified structured annotations, and apply supported effect types through shared code. Reject unsupported mechanics explicitly; do not branch on feature names in presentation templates.
- Prefer one shared spellcasting ability for a new character when every source permits it. Only present different abilities as necessary when the rules do not allow a common choice; preserve explicitly saved/imported choices and display any differences accurately.
- Use a Sol model for independent agent reviews.
- Target `character-builder` with small feature PRs. Merge only after explicit user approval; keep auto-merge disabled.
- Follow the repository's ES module and tab-indentation conventions. Run checks appropriate to the changed module.
