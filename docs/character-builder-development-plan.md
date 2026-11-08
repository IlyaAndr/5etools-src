# D&D 2024 Character Builder Development Plan

Status: PRs #1 and #2 are merged, covering the draft save format and reviewed species catalog. PR #3 adds the early online sheet and PDF preview described in [character-builder-preview.md](character-builder-preview.md). The development and review process is described in [character-builder-workflow.md](character-builder-workflow.md). Subsequent PRs target `character-builder` and are merged after user review.

The first six reference cases cover species contributions for the two draft characters at levels 1/3/5. Full-build legality, class calculations, and complete character sheets remain later work. See [character-builder-reference-results.md](character-builder-reference-results.md) for the primary-rule expectations.

## Goal and Initial Release

The user selects a character's options and receives a calculated sheet for online viewing and PDF printing. The sheet includes numerical values, relevant annotations beside them, feature descriptions, spells, and a simple tracker for expendable resources.

The layout follows the `dnd-2024-character-sheets` skill template: a compact A4 character sheet and a separate magic reference. Additional pages accommodate larger amounts of information while preserving readability. Campaign-specific rules from the Valorian example do not become general builder rules.

Proposed scope of the first usable release:

- D&D 2024 with a limited, verified selection from PHB 2024;
- a single class, levels 1–5;
- Fighter / Champion and Warlock / Fiend;
- Gnome and Tiefling, the required backgrounds, and their associated feats;
- standard array, point buy, and manual ability score entry;
- local character storage and character file import/export;
- a Russian UI and sheet, with English names alongside translations where useful;
- online viewing, resource marks, and a printable PDF.

Gnome and Tiefling provide the first end-to-end prototype. Supporting the remaining species is a separate required workstream: after the prototype and before expanding the class list, support all ten PHB 2024 species and their available variants. Species progressions above level 5 are verified when the supported character level range expands.

The specific subclasses, localization, and initial release limits are working proposals, not previously confirmed user preferences. Supported options are listed explicitly in the UI. Other species, classes, and levels follow in subsequent stages. Proposed Russian UI localization is separate from the project's English source code, comments, and documentation.

## Data Architecture

The main 5etools JSON files provide the content catalog. An adapter converts the required data into the builder's unified format; small, reviewed additions describe missing relationships, constraints, and effects. Source JSON files retain their upstream format. Foundry data may inform those additions, but the running builder does not depend on it.

Keep four parts separate:

1. **Rules catalog:** classes, species, backgrounds, feats, items, spells, features, choices, and progressions.
2. **Player decisions:** selected entities, ability scores, level advancement history, and permitted replacements.
3. **Calculated character:** final values, annotations, available actions, spells, and resource maxima. Rebuilt from rules and decisions.
4. **Session state:** current HP, spent uses, marks, and notes. Stored separately from calculations and addressed by stable identifiers.

Identifiers account for the entity and its source; retain the rules edition, format version, and dataset version. Translating a display name does not change its identifier. Rules updates must not silently switch a character to another source or edition.

Shared mechanic types include proficiency and expertise, bonuses, conditional advantage, resistance/immunity, selection from a set, dependent choices, level-based feature grants, granted spells, casting methods, expendable resources, and recovery. Implement the types needed by the first characters first; do not design a complete universal rules language in advance.

Species is an independent source of effects alongside class, subclass, background, and feat. Species information is not embedded in individual class handlers. D&D 2024 ability score increases come from backgrounds; do not automatically apply 2014 racial increases to 2024 species.

## Development Sequence

### 1. Model and Two Reference Characters

Define the minimal format for the four data parts, stable IDs, and recalculation rules. Prepare verified Gnome/Fighter and Tiefling/Warlock examples at levels 1, 3, and 5. Record their permitted choices and the basis for calculations.

Use these examples to define the limits of automatic coverage: which values are calculated, which annotations are displayed, and which features currently appear only as descriptions. A feature without an implemented effect does not count as fully supported.

**Done when:** the format represents both examples and distinguishes advantage from a numerical bonus, Pact Magic from a free species spell use, and player decisions from current session marks.

### 2. Data Conversion and an Early Sheet

Connect only the required source entities, their references, and reviewed additions. Build both reference characters from this data before implementing the full creation wizard.

Adapt the skill template for ability scores, saving throws, all skills, core combat values, attacks, resources, defenses, features, and the spell reference. The calculated character becomes the shared source for screen and print presentations.

Check A4 PDF export, Cyrillic text, long names, multiple pages, and space for marks early. Use browser printing; the skill's existing exporter can be adapted for reproducible PDF checks.

**Done when:** both examples appear in the browser and produce readable PDFs without clipping; Gnome advantage is shown beside the relevant saves, and Tiefling legacy grants the correct spells and resistance together.

### 3. Shared Calculations and Fighter Creation

Implement calculations for ability scores, proficiency bonus (PB), proficiencies and skills, HP, AC, initiative, and primary attacks. Then connect step-by-step selection of species, background, ability scores, class, skills, languages, equipment, and feats.

The UI obtains valid options and selection counts from the model. It explains unavailable options, duplicate proficiencies, and unfinished decisions. Feat prerequisites and dependent choices are validated rather than inferred only from names.

For Fighter, support Fighting Style, Weapon Mastery, the Champion subclass, and features through level 5. Concise rules and resources appear on the sheet according to the selected level.

**Done when:** the user can independently create a Gnome/Fighter at levels 1, 3, and 5, revise choices, and obtain a consistent sheet. Removing a feature leaves no stale bonuses or annotations.

### 4. Magic and Warlock Creation

Add the magic model: available spell lists, cantrips, prepared/granted spells, each source's spellcasting ability, save DCs, and attack bonuses. Ordinary spell slots, Pact Magic, and free uses are separate resources.

Support Warlock / Fiend through level 5, the required invocations, and their prerequisites. A Tiefling's legacy selection determines its resistance, spells, and grant levels; the permitted spellcasting ability is selected separately. Species spell grants use total character level.

Each spell has one description and may have multiple sources and casting methods. Independent free uses retain separate IDs. Combining descriptions must preserve the minimum level of free casting and the option to spend spell slots.

**Done when:** a level-5 Tiefling/Warlock has the correct magic list, separate Hellish Rebuke and Darkness counters, and a separate Pact Magic resource; cantrips do not receive expendable-use marks.

### 5. Simple Tracker, Saving, and Transfer

Add interactive resource marks, current and temporary HP, and the required sheet fields. Provide Short Rest and Long Rest recovery for resources with explicit recovery rules; describe special partial-recovery methods separately. Rest changes other fields only according to explicitly implemented rules.

Store each character independently. Add a character list, loading, duplication, and versioned JSON import/export. Preserve notes and compatible marks during recalculation; handle changes to resource maxima explicitly.

For printing, offer a clean sheet for pencil marks and a separate option to print current marks. A visible label explains whether a mark represents a spent use.

**Done when:** reloading restores the character and marks, characters do not share state, rests recover the appropriate resources, and import/export preserves decisions and session state. Clean printing does not erase saved marks.

### 6. Level Advancement and the First Usable Release

Implement sequential level advancement that shows new choices, new features, and permitted replacements. Use decision history to distinguish a permitted level-up replacement from arbitrary build editing.

Recalculate after changes to species, background, or other decisions. When reducing level or removing a dependency, report choices that are no longer valid. Offer corrections and remove the hidden effects of deleted features.

**Done when:** both reference characters advance from level 1 to level 5 with results matching the verified examples. Unfinished or invalid choices are visible before final export. This is the first release usable in actual play.

### 7. All PHB 2024 Species and Their Variants

Support all ten species in `data/races.json` with source `XPHB`. Also handle related variants represented in the source data through `_versions`, lineages, and nested choices. Listing the base species is insufficient: all of its permitted variants must produce consistent effects.

Addition order after the end-to-end prototype:

| Order | Species | Implementation and Verification |
| --- | --- | --- |
| 1, in the prototype | Gnome | Advantage on three saving throws, Forest/Rock lineage, species magic, and spellcasting ability selection; PB-based Speak with Animals uses for Forest Gnomes and a device reminder for Rock Gnomes |
| 2, in the prototype | Tiefling | Three legacies; linked resistance and magic choices; independent free spell uses at levels 3/5 |
| 3 | Human | Size selection, an additional skill and Origin feat; nested feat choices; Heroic Inspiration after a Long Rest |
| 4 | Halfling | Conditional advantage against fear, rerolling a 1, and concise movement and hiding annotations |
| 5 | Dwarf | Additional maximum HP at every level, Darkvision, Poison resistance, conditional advantage, and PB-based Stonecunning uses |
| 6 | Orc | Independent Adrenaline Rush and Relentless Endurance resources; different recovery rules; PB-based temporary HP |
| 7 | Elf | Three lineages; linked speed/vision/magic; skill selection; advantage against Charmed; Trance; permitted High Elf cantrip replacement after a rest |
| 8 | Dragonborn | Ten ancestry options; linked breath damage type and resistance; CON-based DC; level-based damage; PB-based uses; a separate flight resource from level 5 |
| 9 | Goliath | Six ancestry options; the selected ability and its resource; carrying capacity and conditional annotations; Large Form with a separate resource from level 5 |
| 10 | Aasimar | Resistances, PB-based Healing Hands, CHA-based Light, and Celestial Revelation from level 3; transformation options and their shared resource |

Extend existing shared mechanics as additional species are added. For example, Elf magic uses the same spell-grant mechanism as Tiefling magic, while Dwarf and Dragonborn resources use a shared PB-based maximum formula.

Normalizing `_versions` includes checking consistency with the base species and lineage text. Flag discrepancies for verification against primary sources rather than silently choosing a value. One initial audit item: the current JSON gives the base Tiefling / XPHB `darkvision: 60`, while its Abyssal Legacy version specifies `120`, without an explanation in the legacy table. Until verified, this is a data discrepancy rather than an established rule.

Distinguish decisions made during character creation, after a rest, and each time an ability is used. Goliath ancestry is a build decision; an Aasimar's Celestial Revelation option and a Dragonborn's breath area shape are selected when used. Show the available options on the sheet without permanently locking one by mistake. Aasimar transformation options share one resource rather than each receiving an independent free use.

Describe temporary and conditional effects beside the relevant values or in the feature block. Flight granted by an ability must not become a permanent Fly Speed; advantage against a particular condition must not appear as unconditional advantage on the entire saving throw. Accurate annotations, values, and trackers are sufficient for the printable sheet; automatic detection of current combat conditions is unnecessary.

**Done when:** all ten species and their variants are available with supported classes at levels 1–5, choices are validated, and effects and resources appear correctly online and in PDF. A Fighter receives species magic even without class spell slots. Changing species or lineage removes only its dependent features and requests any newly required choices.

### 8. Expand Class and Content Coverage

Add classes according to the new mechanics they introduce, reusing existing handlers:

| Order | New Coverage |
| --- | --- |
| Wizard | Full spellcasting, spellbook, and preparation |
| Cleric | Preparation from the class list, domain spells, and Channel Divinity |
| Rogue | Expertise, Sneak Attack, and related annotations |
| Barbarian | Rage, alternative AC calculations, and conditional bonuses |
| Bard | Combined spellcasting, expertise, and support resources |
| Sorcerer | Sorcery Points and Metamagic |
| Paladin and Ranger | Half-caster progression and associated resources |
| Monk | Focus Points, attack features, and progressions |
| Druid | Wild Shape and the required additional forms/stat blocks |

This order tests new families of mechanics; implementations need not be entirely isolated. Work may be combined as shared rules are reused. Adding a class includes subclasses from the selected source set and reference builds.

Expand PHB 2024 backgrounds and feats using the already verified interaction rules for species. Separately test more complex subclasses such as Battle Master and Eldritch Knight: maneuver choices, resources, and subclass spellcasting must remain represented beyond the class name.

Initially, verified classes support levels 1–5. Then extend class and species progressions through level 20, including higher-level feats, resource changes, and permitted replacements. Check PB increases and species progression boundaries, such as Dragonborn breath damage at levels 5/11/17 and the Dwarf HP increase at every level. Full PHB 2024 support is complete only after all selected entities and levels are covered, rather than merely listed in the catalog.

### 9. Reliable Release and Future Features

Refine mobile usability, choice correction, regeneration, data transfer, and save migration. Establish the 5etools update process: source version, change report, and reference-build checks before updating character data.

Then plan multiclassing, additional books, house rules, and the 2014 edition. Multiclassing needs its own checks for prerequisites, starting proficiencies, spellcasting progressions, overlapping features, and resources. A full combat engine, automatic battlefield-condition detection, accounts, and synchronization are outside the proposed initial release.

## Checks Throughout Development

Add checks alongside their mechanics rather than postponing them until the final stage:

- identical decisions produce identical calculated values;
- Gnome advantage changes neither the numerical save bonus nor saving throw proficiency;
- Tiefling legacy links resistance and spells; grants at levels 3/5 and recovery are correct;
- species and variants are tested with both initial classes; class selection does not disable species magic;
- Humans receive their full skill and feat choices, with duplicates and feat prerequisites handled by the rules;
- Dwarf HP increases, PB-based values, and species feature grant levels recalculate when level changes;
- conditional Halfling, Dwarf, and Elf defenses do not become unconditional bonuses;
- Dragonborn ancestry links resistance and breath, while Goliath ancestry determines the appropriate ability;
- Celestial Revelation options use one shared resource rather than independent free uses;
- rests recover Orc resources according to their different recovery rules and permit only the allowed replacements;
- independent free spells do not share a single mark; Pact Magic and other magic sources remain separate;
- two sources of one spell produce one description while preserving independent casting methods and resources;
- ability score limits, skill selection counts, feat prerequisites, and invocation prerequisites are enforced;
- changing decisions removes obsolete effects and reveals invalid dependencies;
- rebuilding a sheet preserves notes and compatible session state;
- online sheets and PDFs use the same calculated values;
- PDF checks use actual A4 previews, including long text and multi-page spell references;
- the shared configuration contains no campaign-specific rules from the skill example.

## Technical Guidelines

- Isolate builder code in a separate module within the fork to reduce overlap with 5etools updates.
- Separate calculations, data conversion, and UI. HTML/PDF receive a prepared sheet model.
- Choose UI tools after the early end-to-end example confirms support for forms, saving, and printing.
- Retain sources and calculation rationale for diagnostics; show information useful to the player on the game sheet.
- Estimate delivery times after stage 2 reveals the actual cost of normalization, missing rules, and print layout.

## Implementation References

- Repository inspected at commit `87471edde497ae786404282fdeabcea168752670`.
- Base data: `data/class/`, `data/races.json`, `data/backgrounds.json`, `data/feats.json`, `data/optionalfeatures.json`, `data/spells/`, and related item/source catalogs.
- Gnome advantage: `data/races.json`, Gnome / XPHB; supplementary Foundry data: `data/foundry-races.json`, Gnomish Cunning / XPHB.
- Tiefling magic: `data/races.json`, Tiefling / XPHB, `additionalSpells`, and the Fiendish Legacy description.
- Existing ability score generator: `js/statgen/statgen-ui.js`.
- Character sheet skill: `/home/ilya/.codex/skills/dnd-2024-character-sheets/SKILL.md`.
- Template: `assets/sheet.css`, `assets/sheet.js`, and `references/character-data.md` within that skill.
