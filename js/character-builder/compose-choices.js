import {validateCharacterDocument} from "./character-document.js";
import {describeChoices, option, refKey} from "./choice-common.js";
import {getBackgroundSourceChoices} from "./source-choices.js";
import {getSpeciesChoiceDescriptors, findSpeciesRule} from "./species-choices.js";
import {getBackgroundChoiceDescriptors} from "./background-choices.js";
import {getFeatChoiceDescriptors, getFeatRule} from "./feat-choices.js";
import {getEquipmentChoiceDescriptors} from "./equipment-choices.js";

function getBackgroundSkillIds (document, {rules, sources}) {
	if (!document.build.background) return [];
	if (sources?.backgrounds?.background) return getBackgroundSourceChoices(sources, document.build.background).backgroundSkills;
	return rules?.backgrounds?.[refKey(document.build.background)]?.skills || [];
}

/**
 * Restrict independent spellcasting-ability choices to abilities that every
 * selected source allows. Saved values remain visible so imported characters
 * keep their explicit decisions; the sheet reports any remaining difference.
 */
function restrictToSharedSpellcastingAbility (document, descriptors, {catalog, rules, spellcastingAbility}) {
	const species = findSpeciesRule(catalog, document.build.species);
	const speciesAbilityId = species?.abilityChoiceId || null;
	const feat = getFeatRule(document.build.background, rules);
	const featAbilityId = feat?.rule.spellGroup ? `${feat.owner}:ability` : null;
	const abilitySets = [];
	const speciesDescriptor = descriptors.find(descriptor => descriptor.id === speciesAbilityId);
	if (speciesDescriptor) abilitySets.push(speciesDescriptor.options.map(entry => entry.id));
	if (spellcastingAbility) abilitySets.push([spellcastingAbility]);
	const featDescriptor = descriptors.find(descriptor => descriptor.id === featAbilityId);
	if (featDescriptor) abilitySets.push(featDescriptor.options.map(entry => entry.id));
	if (abilitySets.length < 2) return descriptors;
	const common = abilitySets.reduce((result, values) => result.filter(id => values.includes(id)));
	if (!common.length) return descriptors;
	const restrict = descriptor => descriptor && {
		...descriptor,
		options: descriptor.options.filter(entry => common.includes(entry.id) || descriptor.selected.includes(entry.id)),
	};
	return descriptors.map(descriptor => descriptor.id === speciesAbilityId || descriptor.id === featAbilityId ? restrict(descriptor) : descriptor);
}

/**
 * Compose independent species, background, feat, equipment, and class
 * contributions. Only cross-source conflicts are resolved here: background
 * skills are removed from the class list, and the species and feat casting
 * abilities are limited to a shared ability when one exists.
 */
export function composeChoiceDescriptors (document, catalog, {rules, sources, spells} = {}, {classDescriptors = [], spellcastingAbility = null} = {}) {
	validateCharacterDocument(document);
	const descriptor = describeChoices(document);
	const classId = refKey(document.build.class);
	const classOwner = `class:${classId}`;
	const backgroundSkills = getBackgroundSkillIds(document, {rules, sources});
	const classSkills = classDescriptors.find(entry => entry.id === `${classOwner}:skills`);
	const distinctClassSkills = classSkills
		? {...classSkills, options: classSkills.options.filter(entry => !backgroundSkills.includes(entry.id))}
		: null;
	const languages = rules?.standardLanguages
		? descriptor("character:languages", "Languages (include Common)", 3, Object.entries(rules.standardLanguages).map(([id, label]) => option(id, label)))
		: null;
	const descriptors = [
		...getSpeciesChoiceDescriptors(document, catalog, {sources}),
		...getBackgroundChoiceDescriptors(document, {rules, sources}),
		...(languages ? [languages] : []),
		...(distinctClassSkills ? [distinctClassSkills] : []),
		...getEquipmentChoiceDescriptors(document, {rules}),
		...getFeatChoiceDescriptors(document, {rules, sources, spells}),
		...classDescriptors.filter(entry => entry !== classSkills),
	];
	return restrictToSharedSpellcastingAbility(document, descriptors, {catalog, rules, spellcastingAbility});
}
