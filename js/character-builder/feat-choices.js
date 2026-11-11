import {validateCharacterDocument} from "./character-document.js";
import {describeChoices, getSpellOptions} from "./choice-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getBackgroundRule} from "./background-choices.js";

/** Resolve the origin feat granted by a background to its reviewed annotation. */
export function getFeatRule (background, rules) {
	const entry = getBackgroundRule(background, rules);
	if (!entry?.rule.featId) return null;
	const rule = rules?.feats?.[entry.rule.featId];
	if (!rule) throw new TypeError(`Missing reviewed feat ${entry.rule.featId}.`);
	return {id: entry.rule.featId, owner: `feat:${entry.rule.featId}`, rule};
}

/** Read the original feat record for the reviewed spell list and ability choice. */
export function getFeatSourceChoices (sources, featRule) {
	if (!featRule?.rule.spellGroup) return null;
	const matches = (sources?.feats?.feat || []).filter(feat => feat.name === featRule.rule.record.name && feat.source === featRule.rule.record.source);
	if (matches.length !== 1) throw new TypeError(`Missing or ambiguous ${featRule.rule.record.source} ${featRule.rule.record.name} source record.`);
	const group = (matches[0].additionalSpells || []).find(candidate => candidate.name === featRule.rule.spellGroup);
	const abilities = group?.ability?.choose;
	if (!Array.isArray(abilities) || !abilities.length) throw new TypeError(`Missing ${featRule.rule.name} spellcasting abilities.`);
	return {
		record: matches[0],
		abilities: [...abilities],
		cantrips: [...featRule.rule.cantrips],
		spells: [...featRule.rule.spells],
	};
}

/** Return origin-feat choices independently of the species or class. */
export function getFeatChoiceDescriptors (document, {rules, sources, spells} = {}) {
	validateCharacterDocument(document);
	const feat = getFeatRule(document.build.background, rules);
	if (!feat?.rule.spellGroup) return [];
	const sourceChoices = getFeatSourceChoices(sources, feat);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	const descriptor = describeChoices(document);
	const label = feat.rule.record.name;
	return [
		descriptor(`${feat.owner}:ability`, `${label} Spellcasting Ability`, 1, sourceChoices.abilities.map(id => ({id, label: abilityName(id)}))),
		descriptor(`${feat.owner}:cantrips`, `${label} Cantrips`, sourceChoices.cantrips.length, getSpellOptions(rawSpells, sourceChoices.cantrips)),
		descriptor(`${feat.owner}:spell`, `${label} Level 1 Spell`, sourceChoices.spells.length, getSpellOptions(rawSpells, sourceChoices.spells)),
	];
}
