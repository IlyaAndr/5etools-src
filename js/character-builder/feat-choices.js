import {ABILITY_IDS, validateCharacterDocument} from "./character-document.js";
import {describeChoices, getSpellOptions} from "./choice-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getBackgroundRule} from "./background-choices.js";
import {getSpellQueryOptions, parseSpellQuery, resolveSpellCatalog} from "./spell-catalog.js";

/** Resolve the origin feat granted by a background to its reviewed annotation. */
export function getFeatRule (background, rules) {
	const entry = getBackgroundRule(background, rules);
	if (!entry?.rule.featId) return null;
	const rule = rules?.feats?.[entry.rule.featId];
	if (!rule) throw new TypeError(`Missing reviewed feat ${entry.rule.featId}.`);
	return {id: entry.rule.featId, owner: `feat:${entry.rule.featId}`, rule};
}

/**
 * Read a general feat's Ability Score Increase from its source record: either a
 * single fixed ability or a choice among a small set, always +1. Epic Boons
 * raise the ability maximum to 30 instead of 20.
 */
export function getFeatAbilityChoice (featRecord) {
	if (!Array.isArray(featRecord?.ability) || featRecord.ability.length !== 1) return null;
	const entry = featRecord.ability[0];
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Unsupported ${featRecord.name} ability increase.`);
	const max = readAbilityMax(featRecord, entry);
	if (entry.choose !== undefined) {
		const choose = entry.choose;
		if (!choose || typeof choose !== "object" || !Array.isArray(choose.from) || !choose.from.length
			|| (choose.amount !== undefined && choose.amount !== 1)
			|| choose.from.some(ability => !ABILITY_IDS.includes(ability))) throw new TypeError(`Unsupported ${featRecord.name} ability choice.`);
		return {options: [...choose.from], amount: 1, max};
	}
	const abilities = ABILITY_IDS.filter(ability => entry[ability] !== undefined);
	if (abilities.length !== 1 || entry[abilities[0]] !== 1 || Object.keys(entry).some(key => !ABILITY_IDS.includes(key) && key !== "max")) throw new TypeError(`Unsupported ${featRecord.name} ability increase.`);
	return {fixed: abilities[0], amount: 1, max};
}

/** Read the ability maximum a reviewed feat raises, defaulting to the usual 20. */
function readAbilityMax (featRecord, entry) {
	if (entry.max === undefined) return 20;
	if (!Number.isSafeInteger(entry.max) || entry.max <= 20 || entry.max > 30) throw new TypeError(`Unsupported ${featRecord.name} ability maximum.`);
	return entry.max;
}

/** Find the original record behind a reviewed feat annotation. */
export function findFeatRecord (sources, featRule) {
	const matches = (sources?.feats?.feat || []).filter(record => record.name === featRule.record.name && record.source === featRule.record.source);
	if (matches.length !== 1) throw new TypeError(`Missing or ambiguous ${featRule.record.source} ${featRule.record.name} source record.`);
	return matches[0];
}

const ARMOR_KEYS = Object.freeze(["light", "medium", "heavy", "shield"]);
const WEAPON_KEYS = Object.freeze(["martial", "simple"]);
const ARMOR_TRAINING = Object.freeze({light: "Light armor", medium: "Medium armor", heavy: "Heavy armor", shield: "Shields"});
const WEAPON_TRAINING = Object.freeze({martial: "Martial weapons", simple: "Simple weapons"});

/**
 * Evaluate a feat's reviewed prerequisites: its character level, one of its
 * ability requirements, spellcasting, and armor proficiency. Entries in a
 * feat's prerequisite list are alternatives; every key inside one entry must
 * hold. Weapon and skill/tool proficiency prerequisites stay unsupported.
 */
export function meetsFeatPrerequisites (featRecord, {level, scores, spellcasting, proficiencies}) {
	const prerequisites = featRecord?.prerequisite;
	if (prerequisites === undefined) return true;
	if (!Array.isArray(prerequisites) || !prerequisites.length) throw new TypeError(`Unsupported ${featRecord.name} prerequisites.`);
	return prerequisites.some(entry => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Unsupported ${featRecord.name} prerequisite.`);
		for (const key of Object.keys(entry)) if (!["level", "ability", "spellcasting2020", "proficiency"].includes(key)) throw new TypeError(`Unsupported ${featRecord.name} prerequisite ${key}.`);
		if (entry.level !== undefined && (!Number.isSafeInteger(entry.level) || level < entry.level)) return false;
		if (entry.ability !== undefined) {
			if (!Array.isArray(entry.ability) || !entry.ability.length) throw new TypeError(`Unsupported ${featRecord.name} ability prerequisite.`);
			const met = entry.ability.every(group => group && typeof group === "object" && !Array.isArray(group)
				&& Object.entries(group).every(([ability, value]) => ABILITY_IDS.includes(ability) && Number.isSafeInteger(value) && (scores[ability] ?? 0) >= value));
			if (!met) return false;
		}
		if (entry.spellcasting2020 !== undefined && (typeof entry.spellcasting2020 !== "boolean" || (entry.spellcasting2020 && !spellcasting))) return false;
		if (entry.proficiency !== undefined && !meetsProficiencyPrerequisite(featRecord, entry.proficiency, proficiencies)) return false;
		return true;
	});
}

/** Match an armor-proficiency prerequisite against the character's training. */
function meetsProficiencyPrerequisite (featRecord, requirement, proficiencies) {
	if (!Array.isArray(requirement) || !requirement.length) throw new TypeError(`Unsupported ${featRecord.name} proficiency prerequisite.`);
	if (!proficiencies?.armor) throw new TypeError(`${featRecord.name}: missing the character's armor proficiencies.`);
	return requirement.some(group => {
		if (!group || typeof group !== "object" || Array.isArray(group)) throw new TypeError(`Unsupported ${featRecord.name} proficiency prerequisite.`);
		return Object.entries(group).every(([kind, value]) => {
			if (kind !== "armor" || !ARMOR_KEYS.includes(value)) throw new TypeError(`Unsupported ${featRecord.name} proficiency prerequisite ${kind}.`);
			return proficiencies.armor.has(value);
		});
	});
}

function readGrants (featRecord, entries, allowed, field) {
	const grants = [];
	if (entries === undefined) return grants;
	if (!Array.isArray(entries)) throw new TypeError(`Unsupported ${featRecord.name} ${field}.`);
	for (const entry of entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Unsupported ${featRecord.name} ${field}.`);
		for (const [key, value] of Object.entries(entry)) {
			if (value !== true || !allowed.includes(key)) throw new TypeError(`Unsupported ${featRecord.name} ${field} ${key}.`);
			if (!grants.includes(key)) grants.push(key);
		}
	}
	return grants;
}

/** Read the armor and weapon proficiencies a feat grants, as raw training keys. */
export function getFeatProficiencyGrants (featRecord) {
	return {
		armor: readGrants(featRecord, featRecord.armorProficiencies, ARMOR_KEYS, "armor training"),
		weapons: readGrants(featRecord, featRecord.weaponProficiencies, WEAPON_KEYS, "weapon training"),
	};
}

/** Read the armor and weapon training a feat grants as display labels. */
export function getFeatTraining (featRecord) {
	const grants = getFeatProficiencyGrants(featRecord);
	return [
		...grants.armor.map(key => ARMOR_TRAINING[key]),
		...grants.weapons.map(key => WEAPON_TRAINING[key]),
	];
}

/** Count the spell picks a feat grants at one character level. */
export function getFeatSpellChoiceCount (choice, level) {
	if (!choice || typeof choice !== "object") throw new TypeError("feat spell choice: expected an annotation");
	if (choice.count !== undefined) {
		if (!Number.isSafeInteger(choice.count) || choice.count < 1) throw new TypeError("feat spell choice: unsupported count");
		return choice.count;
	}
	if (!Array.isArray(choice.levels) || !choice.levels.length) throw new TypeError("feat spell choice: missing levels");
	let total = 0;
	let previous = 0;
	for (const entry of choice.levels) {
		if (!Number.isSafeInteger(entry.level) || entry.level <= previous || entry.level > 20 || !Number.isSafeInteger(entry.count) || entry.count < 1) throw new TypeError("feat spell choice: unsupported level grants");
		previous = entry.level;
		if (level >= entry.level) total += entry.count;
	}
	return total;
}

/** Read the fixed tool proficiencies a feat grants, as raw tool names. */
export function getFeatFixedTools (featRecord) {
	const entries = featRecord?.toolProficiencies;
	if (entries === undefined) return [];
	if (!Array.isArray(entries)) throw new TypeError(`Unsupported ${featRecord.name} tool proficiencies.`);
	const tools = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Unsupported ${featRecord.name} tool proficiencies.`);
		for (const [key, value] of Object.entries(entry)) {
			if (value !== true) throw new TypeError(`Unsupported ${featRecord.name} tool choice ${key}.`);
			if (!tools.includes(key)) tools.push(key);
		}
	}
	return tools;
}

/** Read the senses (blindsight or truesight) a feat grants. */
export function getFeatSenses (featRecord) {
	const senses = featRecord?.senses;
	if (senses === undefined) return [];
	if (!Array.isArray(senses) || !senses.length) throw new TypeError(`Unsupported ${featRecord.name} senses.`);
	return senses.map(entry => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`Unsupported ${featRecord.name} sense.`);
		const [[type, range]] = Object.entries(entry);
		if ((type !== "blindsight" && type !== "truesight") || !Number.isSafeInteger(range) || range < 1) throw new TypeError(`Unsupported ${featRecord.name} sense.`);
		return {type, range};
	});
}

/** Read one spell choice entry, rejecting shapes this subset cannot review. */
function readSpellEntry (entry, path) {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`${path}: expected a spell choice entry`);
	if (typeof entry.choose !== "string" || !entry.choose.trim()) throw new TypeError(`${path}.choose: expected a filter expression`);
	if (entry.count !== undefined && (!Number.isSafeInteger(entry.count) || entry.count < 1)) throw new TypeError(`${path}.count: expected a positive integer`);
	return {query: entry.choose, count: entry.count ?? 1};
}

/** Read the reviewed level of one spell filter expression. */
function readQueryLevel (query, path) {
	const levels = parseSpellQuery(query).filter(term => term.kind === "level");
	if (levels.length !== 1 || levels[0].values.length !== 1 || levels[0].values[0].negated) throw new TypeError(`${path}: unsupported feat spell filter "${query}"`);
	return levels[0].values[0].level;
}

/**
 * Read the spell choices an additional-spells group grants. Each entry names
 * the filter expression the site already uses, so the offered spells come from
 * the pinned data instead of a copied list.
 */
function readSpellChoices (group, label) {
	const queries = [];
	const collect = (list, path) => {
		if (!Array.isArray(list)) throw new TypeError(`${path}: expected a spell choice list`);
		for (const [index, entry] of list.entries()) queries.push(readSpellEntry(entry, `${path}[${index}]`));
	};
	for (const key of Object.keys(group)) if (!["name", "ability", "known", "innate"].includes(key)) throw new TypeError(`${label}.${key}: unsupported spell list`);
	if (group.known !== undefined) {
		if (!group.known || typeof group.known !== "object" || Array.isArray(group.known)) throw new TypeError(`${label}.known: expected an object`);
		for (const [level, list] of Object.entries(group.known)) {
			if (!/^(?:_|[0-9]+)$/.test(level)) throw new TypeError(`${label}.known.${level}: unsupported spell list`);
			collect(list, `${label}.known.${level}`);
		}
	}
	if (group.innate !== undefined) {
		if (!group.innate || typeof group.innate !== "object" || Array.isArray(group.innate)) throw new TypeError(`${label}.innate: expected an object`);
		for (const [ability, record] of Object.entries(group.innate)) {
			if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).some(key => key !== "daily")) throw new TypeError(`${label}.innate.${ability}: unsupported innate spell shape`);
			for (const [level, list] of Object.entries(record.daily || {})) collect(list, `${label}.innate.${ability}.daily.${level}`);
		}
	}
	const merged = new Map();
	for (const entry of queries) {
		const level = readQueryLevel(entry.query, label);
		if (!merged.has(entry.query)) merged.set(entry.query, {query: entry.query, level, count: 0});
		merged.get(entry.query).count += entry.count;
	}
	const choices = [...merged.values()].sort((left, right) => left.level - right.level).map(({query, level, count}) => ({
		id: level === 0 ? "cantrips" : "spell",
		label: level === 0 ? "Cantrips" : `Level ${level} Spell`,
		count,
		query,
	}));
	if (!choices.length) throw new TypeError(`${label}: no spell choices`);
	if (new Set(choices.map(choice => choice.id)).size !== choices.length) throw new TypeError(`${label}: repeated spell levels`);
	return choices;
}

/** Read the original feat record for the reviewed spell choices and ability choice. */
export function getFeatSourceChoices (sources, feat) {
	const featRule = feat?.rule ?? feat;
	if (!featRule?.spellGroup) return null;
	const matches = (sources?.feats?.feat || []).filter(feature => feature.name === featRule.record.name && feature.source === featRule.record.source);
	if (matches.length !== 1) throw new TypeError(`Missing or ambiguous ${featRule.record.source} ${featRule.record.name} source record.`);
	const group = (matches[0].additionalSpells || []).find(candidate => candidate.name === featRule.spellGroup);
	if (!group) throw new TypeError(`Missing ${featRule.name} spell group ${featRule.spellGroup}.`);
	const abilities = group.ability?.choose;
	if (!Array.isArray(abilities) || !abilities.length) throw new TypeError(`Missing ${featRule.name} spellcasting abilities.`);
	return {record: matches[0], abilities: [...abilities], spellChoices: readSpellChoices(group, featRule.name)};
}

/** Build the skill and tool options for a feat's reviewed proficiency choice. */
export function getFeatProficiencyOptions (annotation, rules, skillGroups) {
	const choice = annotation?.proficiencyChoice;
	if (!choice) return null;
	const options = [];
	const skills = skillGroups.flatMap(group => group.skills);
	if (choice.skills === true) {
		for (const skill of skills) options.push({id: `skill:${skill.id}`, label: skill.name});
	} else if (Array.isArray(choice.skills)) {
		for (const id of choice.skills) {
			const skill = skills.find(candidate => candidate.id === id);
			if (!skill) throw new TypeError(`${annotation.name}: unknown skill ${id}.`);
			options.push({id: `skill:${skill.id}`, label: skill.name});
		}
	}
	for (const toolId of choice.tools || []) options.push({id: `tool:${toolId}`, label: rules.tools[toolId]});
	if (options.length < choice.count) throw new TypeError(`${annotation.name}: not enough reviewed proficiencies.`);
	return {count: choice.count, options};
}

/** Build the spell-choice descriptors for one origin feat and owner prefix. */
export function getFeatSpellGroupChoices (featRule, {sources, spells, spellCatalog}, owner) {
	const sourceChoices = getFeatSourceChoices(sources, featRule);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	const catalog = resolveSpellCatalog({spellCatalog, spells: rawSpells, sources});
	if (!catalog) throw new TypeError("Missing spell list data.");
	const cantripChoice = sourceChoices.spellChoices.find(choice => choice.id === "cantrips");
	if (!cantripChoice) throw new TypeError(`${featRule.name}: no cantrip choices`);
	return [
		{id: `${owner}:feat-ability`, label: `${featRule.name} Spellcasting Ability`, count: 1, options: sourceChoices.abilities.map(id => ({id, label: abilityName(id)}))},
		{id: `${owner}:feat-cantrips`, label: `${featRule.name} ${cantripChoice.label}`, count: cantripChoice.count, options: getSpellQueryOptions(catalog, cantripChoice.query)},
		{id: `${owner}:feat-spell`, label: `${featRule.name} Level 1 Spell`, count: featRule.spells.length, options: getSpellOptions(rawSpells, featRule.spells)},
	];
}

/** Return origin-feat choices independently of the species or class. */
export function getFeatChoiceDescriptors (document, {rules, sources, spells, spellCatalog: preparedSpellCatalog} = {}) {
	validateCharacterDocument(document);
	const feat = getFeatRule(document.build.background, rules);
	if (!feat) return [];
	const descriptor = describeChoices(document);
	const label = feat.rule.record.name;
	const result = [];
	if (feat.rule.proficiencyChoice) {
		const choice = getFeatProficiencyOptions(feat.rule, rules, createSkillCatalog(sources?.skills, sources?.abilityNames));
		result.push(descriptor(`${feat.owner}:proficiencies`, `${label} Proficiencies`, choice.count, choice.options));
	}
	if (!feat.rule.spellGroup) return result;
	const sourceChoices = getFeatSourceChoices(sources, feat);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	const spellCatalog = resolveSpellCatalog({spellCatalog: preparedSpellCatalog, spells: rawSpells, sources});
	if (!spellCatalog) throw new TypeError("Missing spell list data.");
	const cantripChoice = sourceChoices.spellChoices.find(choice => choice.id === "cantrips");
	if (!cantripChoice) throw new TypeError(`${label}: no cantrip choices`);
	return [
		...result,
		descriptor(`${feat.owner}:ability`, `${feat.rule.name} Spellcasting Ability`, 1, sourceChoices.abilities.map(id => ({id, label: abilityName(id)}))),
		descriptor(`${feat.owner}:cantrips`, `${feat.rule.name} ${cantripChoice.label}`, cantripChoice.count, getSpellQueryOptions(spellCatalog, cantripChoice.query)),
		// The level-1 spell carries the feat's free-use mechanic, including the
		// reviewed Healing Word healing rider, so its reviewed spell stays an
		// annotation instead of widening to every class spell.
		descriptor(`${feat.owner}:spell`, `${feat.rule.name} Level 1 Spell`, feat.rule.spells.length, getSpellOptions(rawSpells, feat.rule.spells)),
	];
}
