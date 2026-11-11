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
	const [lineageId] = selectedIds(document, species.lineageChoiceId);
	const selectedLineage = species.lineages.find(lineage => lineage.id === lineageId);
	const abilityOptions = selectedLineage?.abilityOptions || [...new Set(species.lineages.flatMap(lineage => lineage.abilityOptions))];
	const result = [
		descriptor(species.lineageChoiceId, species.lineageLabel, 1, species.lineages.map(lineage => option(lineage.id, lineage.name))),
	];
	if (species.abilityChoiceId) result.push(descriptor(species.abilityChoiceId, "Species Spellcasting Ability", 1, abilityOptions.map(id => option(id, abilityName(id)))));
	if (species.sizeChoiceId) {
		result.push({
			...descriptor(species.sizeChoiceId, "Size", 1, species.sizes.map(id => option(id, id[0].toUpperCase() + id.slice(1)))),
			help: "This species offers more than one legal size. Choose the size you want at character creation.",
		});
	}
	return result;
}
