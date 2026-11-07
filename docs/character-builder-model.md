# Character builder: draft save format v1

This first implementation defines a JSON save boundary. It does not resolve the
5etools catalog, validate a legal D&D character, calculate a sheet, or access
browser storage. Every v1 document has `status: "draft"`; passing validation does
not mean the build is complete or ready to play.

## API

`js/character-builder/character-document.js` exports:

- `CHARACTER_DOCUMENT_VERSION`: the current numeric format version, `1`.
- `validateCharacterDocument(document)`: returns `true` or throws `TypeError` with
  a field path. Does not modify its input.
- `serializeCharacterDocument(document)`: validates and returns formatted JSON.
- `parseCharacterDocument(text)`: parses and validates a new independent object.
  The caller replaces existing state only after this function succeeds.

These are browser-compatible ES modules with no runtime dependencies. Validation
rejects unsupported versions and rulesets, unexpected fields, incomplete object
shapes, duplicate choice/resource IDs, unsafe numbers, and non-JSON object fields.
It does not execute data or silently drop extra fields during serialization.
The object API accepts plain objects/arrays in the current JavaScript realm,
including JSON parsed by the loader. Accessors, array subclasses, sparse arrays,
and extra array properties are rejected before values are traversed.

## Stored data

| Field | Purpose |
| --- | --- |
| `schemaVersion`, `status` | Save format version and explicit draft status. |
| `id`, `name` | Stable character ID and freely editable display name. |
| `ruleset` | `"2024"` in the current implementation. |
| `dataset` | Catalog ID (`"5etools"`), version, and exact Git revision. |
| `build` | Player decisions: level, class, species, background, base ability scores and choice selections. |
| `session` | Current/temporary HP, spent resource counts and plain-text notes. |

The current scope is one class and levels 1–5. `build.class`, `build.species`, and
non-null `build.background` contain `{name, source}` references to canonical
5etools entities. Their names are catalog names, not translated display labels.
Changing the character's display name or UI language does not change references.
The entity kind is determined by its field; class and species are independent.
Character IDs are lowercase alphanumeric slugs separated by hyphens, at most 80
characters long. They are distinct from the source-qualified mechanical IDs.

An unselected background and unassigned ability scores are `null`. Ability
methods are `"standard"`, `"pointBuy"`, or `"manual"`. Assigned scores include all
six keys (`str`, `dex`, `con`, `int`, `wis`, `cha`) and represent base scores before
background/feat increases. The 1–30 range checks numeric shape only; point-buy
cost, standard-array distribution, and other game constraints need catalog/rules
validation in a later PR.

`build.choices` is an array of `{id, selected: [...]}` records. IDs identify
catalog-defined questions; selected values identify their answers. Empty arrays
are allowed while completing a draft. The catalog will later validate allowed
answers, counts, prerequisites and when a choice may change. Existing v1 code
does not assume that an unknown ID is an implemented game mechanic.

Mechanical IDs are lowercase ASCII strings containing letters, digits and
`:_./|%-`. Use a source-qualified owner and a stable local suffix, for example
`species:gnome|xphb:lineage`. They must not use translated text. The normalizer
will define the complete mapping; this PR only reserves and validates their
representation. Different source books must have different owner IDs.

`session.hp.current` may be `null` if no current HP has been entered. Otherwise HP
and spent counts are non-negative safe integers. `session.resources` contains
`{id, spent}` records; the ID belongs to the granted resource, not merely a spell
name. This preserves independent uses from different sources. The save does not
store maxima or reset rules: they will come from the derived sheet. Whether a
count exceeds its maximum must be checked against that sheet later.

## Kept outside the save

The normalized catalog and calculated sheet have different responsibilities:

1. **Catalog:** known entities, choices, feature effects, grants, resource maxima
   and recovery rules. Built from 5etools and reviewed additions.
2. **Build:** decisions made by the player, stored in this document.
3. **Derived sheet:** calculated bonuses, HP maximum, AC, notes beside saves,
   granted spells and resource definitions. Rebuilt from catalog + build.
4. **Session:** the player's current marks and notes, stored in this document.

`sheet`, `catalog`, derived bonuses, maxima and recovery rules are rejected as
save fields. They must not become a competing source of truth. Rebuilding a
sheet must preserve compatible session values by character/resource ID; that
reconciliation is future work.

## Draft fixtures

- `test/fixtures/character-builder/gnome-fighter-draft.json`: level-1 Gnome/Fighter
  with forest lineage and INT for species magic, but no background or scores.
- `test/fixtures/character-builder/tiefling-warlock-draft.json`: incomplete level-5
  Tiefling/Warlock showing Infernal lineage, INT for species magic independent of
  class magic, and separate Pact Magic / Hellish Rebuke / Darkness resource IDs.

The fixtures are save-format examples, not verified playable builds or expected
calculated sheets. Subclass, background, class spells and other required choices
remain unfinished. No rules from the Valorian campaign example are inherited.
Future PRs will add catalog normalization, validated builds at levels 1/3/5 and
the corresponding expected sheets.

The initial species catalog resolves species contributions from these drafts.
Its six reference cases check levels 1/3/5 against primary rules; they do not
validate complete builds. See `docs/character-builder-reference-results.md`.

## Validation

Run the focused tests with:

```sh
npm run test:unit -- --runInBand test/jest/character-builder/CharacterDocument.test.js
```

Test coverage includes save round-trips, independent characters and resources,
invalid imports, unsupported versions, non-finite/unsafe counts, duplicate IDs,
unexpected derived fields, and unchanged existing state after a failed import.
