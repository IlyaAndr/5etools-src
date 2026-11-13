import {validateCharacterDocument} from "./character-document.js";
import {describeChoices, option, selectedIds} from "./choice-common.js";
import {createSkillCatalog} from "./skill-catalog.js";

/** Find the reviewed catalog entry for one source-qualified species reference. */
export function findSpeciesRule (catalog, ref) {
	return catalog?.species?.find(entry => entry.ref.name === ref?.name && entry.ref.source === ref?.source) || null;
}

/**
 * Return species-owned choices independently of any class, background, or feat.
 * An unsupported species has no reviewed choices; the composition layer decides
 * whether the character can be edited at all.
 */
export function getSpeciesChoiceDescriptors (document, catalog, {sources} = {}) {
	validateCharacterDocument(document);
	const species = findSpeciesRule(catalog, document.build.species);
	if (!species) return [];
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const descriptor = describeChoices(document);
	const result = [];
	let selectedLineage = null;
	if (species.lineages.length) {
		const [lineageId] = selectedIds(document, species.lineageChoiceId);
		selectedLineage = species.lineages.find(lineage => lineage.id === lineageId);
		const abilityOptions = selectedLineage?.abilityOptions || [...new Set(species.lineages.flatMap(lineage => lineage.abilityOptions))];
		result.push(descriptor(species.lineageChoiceId, species.lineageLabel, 1, species.lineages.map(lineage => option(lineage.id, lineage.name))));
		if (species.abilityChoiceId) {
			result.push({
				...descriptor(species.abilityChoiceId, "Species Spellcasting Ability", 1, abilityOptions.map(id => option(id, abilityName(id)))),
				help: `The ${document.build.species.name} spellcasting trait lets you choose the ability used by its spells.`,
			});
		}
	}
	if (species.sizeChoiceId) {
		const sizeLabels = species.sizes.map(id => id[0].toUpperCase() + id.slice(1));
		result.push({
			...descriptor(species.sizeChoiceId, "Size", 1, species.sizes.map((id, index) => option(id, sizeLabels[index]))),
			help: `The 2024 ${document.build.species.name} entry lists ${sizeLabels.join(" or ")}, so either is legal at character creation.`,
		});
	}
	if (species.skillChoiceId) {
		const skills = abilities.flatMap(group => group.skills);
		result.push({
			...descriptor(species.skillChoiceId, "Skill", 1, species.skillOptions.map(id => {
				const skill = skills.find(candidate => candidate.id === id);
				if (!skill) throw new TypeError(`species ${species.id}: unknown skill ${id}`);
				return option(id, skill.name);
			})),
			help: `The 2024 ${document.build.species.name} entry grants one of these skill proficiencies.`,
		});
	}
	if (selectedLineage) {
		for (const choice of selectedLineage.choices || []) {
			const spellName = id => {
				const match = catalog?.spells?.find(candidate => candidate.id === id);
				if (!match) throw new TypeError(`species ${species.id}: unknown cantrip ${id}`);
				return match.ref.name;
			};
			result.push(descriptor(choice.id, `${document.build.species.name} Cantrip`, choice.count, choice.options.map(id => option(id, spellName(id)))));
		}
	}
	return result;
}
