import {validateCharacterDocument} from "./character-document.js";
import {describeChoices, getIncreaseOptions, option, refKey, selectedIds} from "./choice-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getBackgroundSourceChoices} from "./source-choices.js";

/** Find the reviewed rules entry for one source-qualified background reference. */
export function getBackgroundRule (background, rules) {
	if (!background) return null;
	const id = refKey(background);
	const rule = rules?.backgrounds?.[id];
	return rule ? {id, rule} : null;
}

/** Return background-owned choices independently of any class or species. */
export function getBackgroundChoiceDescriptors (document, {rules, sources} = {}) {
	validateCharacterDocument(document);
	const entry = getBackgroundRule(document.build.background, rules);
	if (!entry) return [];
	const {id, rule} = entry;
	const sourceChoices = getBackgroundSourceChoices(sources, document.build.background);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = abilityId => abilities.find(ability => ability.id === abilityId)?.name || abilityId;
	const descriptor = describeChoices(document);
	const increaseId = `background:${id}:ability-increases`;
	const result = [
		descriptor(increaseId, "Background Ability Increases", 1, getIncreaseOptions(
			sourceChoices.backgroundAbilityIds,
			sourceChoices.backgroundWeights,
			abilityName,
			selectedIds(document, increaseId),
		)),
	];
	if (rule.toolOptions) result.push(descriptor(`background:${id}:tool`, "Background Tool", 1, Object.entries(rule.toolOptions).map(([toolId, label]) => option(toolId, label))));
	return result;
}

/** Background gear is granted independently of the class starting package. */
export function getBackgroundEquipment (background, rules) {
	return getBackgroundRule(background, rules)?.rule.equipment || null;
}
