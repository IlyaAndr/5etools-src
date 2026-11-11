# Reviewed species catalog and projections

This module introduces the builder's first supplemental rule annotations and
normalizes a limited 5etools subset. It supports Gnome and Tiefling from PHB 2024
(`XPHB`), including both Gnome lineages and all three Tiefling legacies.

## Inputs and API

```js
const catalog = createSpeciesCatalog({races, spells, rules});
const contribution = projectSpecies(characterDocument, catalog);
```

Import `createSpeciesCatalog` from `js/character-builder/species-catalog.js` and
`projectSpecies` from `js/character-builder/species-projection.js`. The inputs
are parsed JSON objects from `data/races.json`,
`data/spells/spells-xphb.json`, and
`js/character-builder/rules/species.json`. Loading files or fetching them over
HTTP belongs to the caller. Runtime code has no Node, browser storage, Foundry,
or application-global dependencies.

The catalog pins the source dataset ID, version, and revision from the reviewed
annotation file. A document with a different pin is rejected. The caller is
responsible for loading the corresponding source files; this adapter does not
authenticate raw file contents against Git. Annotation format and catalog format
are versioned separately from the saved character document.

## Supplemental rules

The structured source data already contains spell names, spellcasting ability
choices, character-level gates, daily counts, basic size, speed, and Darkvision.
The supplemental JSON adds the relationships and effects that the builder needs:

- Gnomish Cunning grants advantage on Intelligence, Wisdom, and Charisma saves.
  It grants neither a numerical save bonus nor saving throw proficiency.
- Each Tiefling legacy links its resistance to its spell group.
- Granted leveled spells are always prepared, permit casting with suitable
  slots, and recover their free uses after a Long Rest. These permissions are
  different from granting class spell slots.
- Thaumaturgy belongs to Otherworldly Presence independently of legacy. It is
  extracted from the repeated source spell groups and granted once, even while
  legacy selection is pending.
- Rock Gnome clockwork devices do not create automated timers or spent-use
  marks. Their rules are available in the original species description.
- `lineageLabel` names the original species trait that presents the lineage
  choice, so shared code can mark the selected lineage without branching on
  species names. It must match the source trait name.

Spell lists, levels, counts, and references remain sourced from `additionalSpells`
and the spell catalog. Unsupported reference/progression shapes, missing or
duplicate entities, unmapped spell groups, and invalid annotation versions fail
explicitly. Normalization does not infer game mechanics from prose.

The current adapter uses base species records and explicit lineage mappings.
It does not apply arbitrary `_versions` modifications. In this source revision,
the Abyssal Tiefling version specifies 120-foot Darkvision despite the base
record and primary species rule specifying 60 feet. All three legacies use the
verified base value of 60 feet here; the upstream source files remain unchanged.

## Projection output

A projection has `coverage: "species-only"`. It contains size, speed in feet,
Darkvision in feet, creature types, saving throw annotations, resistance types,
species spells, independent resource definitions, and unresolved
species choices. It is a contribution to a future character sheet rather than a
complete legal build or a calculated class sheet.

Choices use the existing stable owner prefix, such as
`species:gnome|xphb:lineage` or `species:tiefling|xphb:legacy`.
Both species use `:spellcasting-ability`. Tiefling size uses
`species:tiefling|xphb:size` with `small` or `medium`.
Missing or empty selections produce `unresolvedChoices`; supplied unsupported
values, multiple selections, and unknown choices for the current species fail.
Choices for other owners do not affect this species-only projection. They need
validation by their own handlers in a later complete-build validator.

Pending choices do not select an arbitrary default. Without a lineage, only
independent base features and spells appear. A pending spellcasting ability is
represented as `null`. The projection deliberately does not compute spell DCs
or attacks from draft ability scores: saved scores are base values, and final
background/feat increases have not yet been applied.

Each granted spell refers to one catalog spell, retaining its source, spell
level, casting time, components, duration, descriptions, ritual metadata,
structured attack/save types, upcast descriptions, and available scaling data.
Projection records identify its selected casting ability, availability level,
prepared status, slot-casting permission, ritual flag, and optional resource ID.
Ritual metadata is preserved for later casting support; this PR does not perform
ritual casting or expend resources.

Each free-use resource has its own ID, spell ID, maximum uses, and recovery rule.
Forest Gnome Speak with Animals uses the character's proficiency bonus; each
leveled Tiefling spell has one independent free use. Cantrips have no expendable
resource. Current spent counts stay in the saved session state and are never
modified or copied into these definitions. Reconciliation of old session marks
with newly granted resources belongs to the later tracker implementation.

## Rule provenance and validation

Species annotations reference the **System Reference Document 5.2.1**, pages
85–86, published by Wizards of the Coast LLC and available at
[the official SRD URL](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).
The SRD is licensed under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
Mechanics are represented as structured data. When presenting ability or spell
descriptions, preserve the full original 5etools text; do not substitute
concise summaries.

Tests read the actual local 5etools source JSON and cover all five lineages,
levels 1/3/5, missing and invalid choices, source/edition isolation, spell
metadata, immutable inputs, independent resources, and malformed source shapes.
Independent reference results are documented separately in
`docs/character-builder-reference-results.md`.

```sh
npm run test:character-builder
npx --no-install vet-eslint js/character-builder test/jest/character-builder
```
