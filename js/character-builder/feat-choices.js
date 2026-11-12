import {validateCharacterDocument} from "./character-document.js";
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
export function getFeatSourceChoices (sources, featRule) {
	if (!featRule?.rule.spellGroup) return null;
	const matches = (sources?.feats?.feat || []).filter(feat => feat.name === featRule.rule.record.name && feat.source === featRule.rule.record.source);
	if (matches.length !== 1) throw new TypeError(`Missing or ambiguous ${featRule.rule.record.source} ${featRule.rule.record.name} source record.`);
	const group = (matches[0].additionalSpells || []).find(candidate => candidate.name === featRule.rule.spellGroup);
	if (!group) throw new TypeError(`Missing ${featRule.rule.name} spell group ${featRule.rule.spellGroup}.`);
	const abilities = group.ability?.choose;
	if (!Array.isArray(abilities) || !abilities.length) throw new TypeError(`Missing ${featRule.rule.name} spellcasting abilities.`);
	return {record: matches[0], abilities: [...abilities], spellChoices: readSpellChoices(group, featRule.rule.name)};
}

/** Return origin-feat choices independently of the species or class. */
export function getFeatChoiceDescriptors (document, {rules, sources, spells, spellCatalog: preparedSpellCatalog} = {}) {
	validateCharacterDocument(document);
	const feat = getFeatRule(document.build.background, rules);
	if (!feat?.rule.spellGroup) return [];
	const sourceChoices = getFeatSourceChoices(sources, feat);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	const spellCatalog = resolveSpellCatalog({spellCatalog: preparedSpellCatalog, spells: rawSpells, sources});
	if (!spellCatalog) throw new TypeError("Missing spell list data.");
	const descriptor = describeChoices(document);
	const label = feat.rule.record.name;
	const cantripChoice = sourceChoices.spellChoices.find(choice => choice.id === "cantrips");
	if (!cantripChoice) throw new TypeError(`${label}: no cantrip choices`);
	return [
		descriptor(`${feat.owner}:ability`, `${label} Spellcasting Ability`, 1, sourceChoices.abilities.map(id => ({id, label: abilityName(id)}))),
		descriptor(`${feat.owner}:cantrips`, `${label} ${cantripChoice.label}`, cantripChoice.count, getSpellQueryOptions(spellCatalog, cantripChoice.query)),
		// The level-1 spell carries the feat's free-use mechanic, including the
		// reviewed Healing Word healing rider, so its reviewed spell stays an
		// annotation instead of widening to every class spell.
		descriptor(`${feat.owner}:spell`, `${label} Level 1 Spell`, feat.rule.spells.length, getSpellOptions(rawSpells, feat.rule.spells)),
	];
}
