import {validateCharacterDocument} from "./character-document.js";
import {SPECIES_CATALOG_VERSION} from "./species-catalog.js";

/** Project only species contributions; this is not a complete character sheet. */
export function projectSpecies (document, catalog) {
	validateCharacterDocument(document);
	if (catalog?.schemaVersion !== SPECIES_CATALOG_VERSION || catalog.ruleset !== document.ruleset) throw new TypeError("catalog: unsupported version or ruleset");
	if (["id", "version", "revision"].some(key => catalog.dataset?.[key] !== document.dataset[key])) throw new TypeError("catalog.dataset: does not match the character's pinned dataset");
	const matches = catalog.species.filter(species => species.ref.name === document.build.species.name && species.ref.source === document.build.species.source);
	if (matches.length !== 1) throw new TypeError("character.build.species: unsupported or ambiguous species reference");
	const species = matches[0];
	const choices = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	const permittedIds = [species.lineageChoiceId, species.abilityChoiceId, species.sizeChoiceId, species.skillChoiceId].filter(Boolean);
	for (const lineage of species.lineages) for (const choice of lineage.choices || []) permittedIds.push(choice.id);
	for (const id of choices.keys()) {
		if (id.startsWith(`${species.id}:`) && !permittedIds.includes(id)) throw new TypeError(`character.build.choices: unknown species choice ${id}`);
	}
	const unresolvedChoices = [];
	function select (id, options) {
		if (!id) return null;
		const selected = choices.get(id) || [];
		if (selected.length > 1 || selected.some(value => !options.includes(value))) throw new TypeError(`character.build.choices: invalid selection for ${id}`);
		if (!selected.length) {
			unresolvedChoices.push({id, options: [...options], reason: "selection-required"});
			return null;
		}
		return selected[0];
	}
	const lineageId = select(species.lineageChoiceId, species.lineages.map(lineage => lineage.id));
	const lineage = species.lineages.find(candidate => candidate.id === lineageId);
	const abilityOptions = lineage?.abilityOptions || [...new Set(species.lineages.flatMap(candidate => candidate.abilityOptions))];
	const ability = species.abilityChoiceId ? select(species.abilityChoiceId, abilityOptions) : species.spellcastingAbility;
	const size = species.sizeChoiceId ? select(species.sizeChoiceId, species.sizes) : species.sizes[0];
	const skill = species.skillChoiceId ? select(species.skillChoiceId, species.skillOptions) : null;
	const proficiencyBonus = 2 + Math.floor((document.build.level - 1) / 4);
	const grants = [...species.baseGrants, ...(lineage?.grants || [])].filter(grant => grant.minimumCharacterLevel <= document.build.level);
	for (const choice of lineage?.choices || []) {
		if (choice.count !== 1) throw new TypeError(`species ${species.id}: unsupported choice count`);
		const selected = select(choice.id, choice.options);
		if (selected) grants.push({spellId: selected, minimumCharacterLevel: choice.minimumCharacterLevel, alwaysPrepared: false, canCastWithSlots: false, resource: null});
	}
	const spells = grants.map(grant => {
		const spell = catalog.spells.find(candidate => candidate.id === grant.spellId);
		if (!spell) throw new TypeError(`catalog.spells: unresolved spell ${grant.spellId}`);
		return {
			id: spell.id,
			ref: {...spell.ref},
			level: spell.level,
			minimumCharacterLevel: grant.minimumCharacterLevel,
			ability,
			alwaysPrepared: grant.alwaysPrepared,
			canCastWithSlots: grant.canCastWithSlots,
			ritual: spell.meta?.ritual === true,
			resourceId: grant.resource?.id || null,
		};
	});
	return {
		speciesId: species.id,
		level: document.build.level,
		proficiencyBonus,
		size,
		speed: species.speed,
		darkvision: species.darkvision,
		creatureTypes: [...species.creatureTypes],
		savingThrowAdvantages: species.savingThrowAdvantages.map(advantage => ({...advantage})),
		resistances: [...new Set([...species.resistances, ...(lineage?.resistances || [])])],
		hpPerLevel: species.hpPerLevel,
		skills: skill ? [skill] : [],
		spellcastingAbility: ability,
		spells,
		resources: grants.filter(grant => grant.resource).map(grant => ({
			id: grant.resource.id,
			spellId: grant.spellId,
			maxUses: grant.resource.uses === "proficiencyBonus" ? proficiencyBonus : grant.resource.uses,
			reset: grant.resource.reset,
		})),
		notes: [...(lineage?.notes || [])],
		unresolvedChoices,
		coverage: "species-only",
	};
}
