export const SPECIES_CATALOG_VERSION = 1;

const SIZES = {S: "small", M: "medium"};
const ABILITIES = ["int", "wis", "cha"];
const SUPPORTED_REFS = ["aasimar|xphb", "dragonborn|xphb", "elf|xphb", "human|xphb", "dwarf|xphb", "gnome|xphb", "goliath|xphb", "halfling|xphb", "orc|xphb", "tiefling|xphb"];

function fail (path, message) { throw new TypeError(`${path}: ${message}`); }
function copy (value) { return JSON.parse(JSON.stringify(value)); }
function slug (value) { return value.toLowerCase().replaceAll(" ", "-"); }
function refKey (ref) { return `${ref.name.toLowerCase()}|${ref.source.toLowerCase()}`; }

function object (value, path, keys) {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
	if (keys && Object.keys(value).some(key => !keys.includes(key))) fail(path, "unsupported fields");
}

function array (value, path) {
	if (!Array.isArray(value)) fail(path, "expected an array");
}

function string (value, path) {
	if (typeof value !== "string" || !value.trim()) fail(path, "expected a non-empty string");
}

function reference (value, path) {
	object(value, path, ["name", "source"]);
	string(value.name, `${path}.name`);
	string(value.source, `${path}.source`);
}

function integer (value, path, min, max = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, "expected an integer in the supported range");
}

function indexEntities (values, path) {
	array(values, path);
	const result = new Map();
	for (const value of values) {
		reference({name: value?.name, source: value?.source}, path);
		const key = refKey(value);
		if (result.has(key)) fail(path, `duplicate reference ${key}`);
		result.set(key, value);
	}
	return result;
}

function spellMetadata (raw, key) {
	string(raw.school, `spell ${key}.school`);
	for (const field of ["time", "duration", "entries"]) {
		array(raw[field], `spell ${key}.${field}`);
		if (!raw[field].length) fail(`spell ${key}.${field}`, "missing spell metadata");
	}
	for (const time of raw.time) {
		object(time, `spell ${key}.time`);
		integer(time.number, `spell ${key}.time.number`, 1);
		string(time.unit, `spell ${key}.time.unit`);
		if (time.condition !== undefined) string(time.condition, `spell ${key}.time.condition`);
	}
	for (const field of ["range", "components"]) object(raw[field], `spell ${key}.${field}`);
	if (raw.meta !== undefined) {
		object(raw.meta, `spell ${key}.meta`);
		if (raw.meta.ritual !== undefined && typeof raw.meta.ritual !== "boolean") fail(`spell ${key}.meta.ritual`, "expected a boolean");
	}
	for (const field of ["savingThrow", "spellAttack", "entriesHigherLevel", "damageInflict"]) {
		if (raw[field] !== undefined) array(raw[field], `spell ${key}.${field}`);
	}
	if (raw.scalingLevelDice !== undefined && (!raw.scalingLevelDice || typeof raw.scalingLevelDice !== "object")) fail(`spell ${key}.scalingLevelDice`, "expected a scaling object or list");
	return copy(Object.fromEntries([
		"school", "page", "time", "range", "components", "duration", "entries", "meta",
		"savingThrow", "spellAttack", "entriesHigherLevel", "scalingLevelDice", "damageInflict",
	].filter(field => raw[field] !== undefined).map(field => [field, raw[field]])));
}

function validateRules (rules) {
	object(rules, "rules", ["schemaVersion", "ruleset", "dataset", "sources", "species"]);
	if (rules.schemaVersion !== 1 || rules.ruleset !== "2024") fail("rules", "unsupported annotation version or ruleset");
	object(rules.dataset, "rules.dataset", ["id", "version", "revision"]);
	if (rules.dataset.id !== "5etools") fail("rules.dataset", "unsupported dataset");
	string(rules.dataset.version, "rules.dataset.version");
	if (typeof rules.dataset.revision !== "string" || !/^[a-f0-9]{40}$/.test(rules.dataset.revision)) fail("rules.dataset.revision", "expected a Git commit SHA");
	array(rules.sources, "rules.sources");
	const sourceIds = new Set();
	for (const source of rules.sources) {
		object(source, "rules.sources", ["id", "title", "url"]);
		for (const key of ["id", "title", "url"]) string(source[key], `rules.sources.${key}`);
		if (sourceIds.has(source.id)) fail("rules.sources", "duplicate source ID");
		sourceIds.add(source.id);
	}
	array(rules.species, "rules.species");
	const refs = new Set();
	for (const rule of rules.species) {
		object(rule, "rules.species", ["ref", "provenance", "lineageChoice", "lineageLabel", "commonSpells", "savingThrowAdvantages", "leveledSpellPolicy", "lineages", "resistances", "hpPerLevel", "spellcastingAbility", "skillChoice", "featChoice"]);
		reference(rule.ref, "rules.species.ref");
		const key = refKey(rule.ref);
		if (!SUPPORTED_REFS.includes(key) || refs.has(key)) fail("rules.species", `unsupported or duplicate species ${key}`);
		refs.add(key);
		object(rule.provenance, "rules.species.provenance", ["sourceId", "pages"]);
		if (!sourceIds.has(rule.provenance.sourceId)) fail("rules.species.provenance", "unknown source ID");
		array(rule.provenance.pages, "rules.species.provenance.pages");
		if (!rule.provenance.pages.length) fail("rules.species.provenance.pages", "missing page references");
		rule.provenance.pages.forEach(page => integer(page, "rules.species.provenance.pages", 1));
		const lineages = rule.lineages === undefined ? [] : rule.lineages;
		const spellLineages = lineages.filter(lineage => lineage.additionalSpellsName !== null && lineage.additionalSpellsName !== undefined);
		if (lineages.length) {
			if (!["lineage", "legacy"].includes(rule.lineageChoice)) fail("rules.species.lineageChoice", "unsupported choice name");
			string(rule.lineageLabel, "rules.species.lineageLabel");
			if (spellLineages.length) {
				object(rule.leveledSpellPolicy, "rules.species.leveledSpellPolicy", ["alwaysPrepared", "canCastWithSlots", "reset"]);
				if (rule.leveledSpellPolicy.alwaysPrepared !== true || rule.leveledSpellPolicy.canCastWithSlots !== true || rule.leveledSpellPolicy.reset !== "long") fail("rules.species.leveledSpellPolicy", "unsupported spell policy");
			} else if (rule.leveledSpellPolicy !== undefined) fail("rules.species.leveledSpellPolicy", "spell policy without spell lineages");
		} else if (rule.lineageChoice !== undefined || rule.lineageLabel !== undefined || rule.leveledSpellPolicy !== undefined) fail("rules.species.lineages", "lineage options without lineages");
		if (rule.resistances !== undefined) {
			array(rule.resistances, "rules.species.resistances");
			if (!rule.resistances.length) fail("rules.species.resistances", "missing resistance annotations");
			rule.resistances.forEach(type => string(type, "rules.species.resistances"));
			if (new Set(rule.resistances).size !== rule.resistances.length) fail("rules.species.resistances", "duplicate resistance");
		}
		if (rule.hpPerLevel !== undefined) integer(rule.hpPerLevel, "rules.species.hpPerLevel", 0, 10);
		if (rule.featChoice !== undefined) {
			const choice = rule.featChoice;
			object(choice, "rules.species.featChoice", ["options", "withheld"]);
			array(choice.options, "rules.species.featChoice.options");
			if (!choice.options.length) fail("rules.species.featChoice.options", "missing feat options");
			choice.options.forEach(id => string(id, "rules.species.featChoice.options"));
			if (new Set(choice.options).size !== choice.options.length) fail("rules.species.featChoice.options", "duplicate feat option");
			if (choice.withheld !== undefined) string(choice.withheld, "rules.species.featChoice.withheld");
		}
		if (rule.skillChoice !== undefined) {
			array(rule.skillChoice, "rules.species.skillChoice");
			if (!rule.skillChoice.length) fail("rules.species.skillChoice", "missing skill options");
			rule.skillChoice.forEach(skill => string(skill, "rules.species.skillChoice"));
			if (new Set(rule.skillChoice).size !== rule.skillChoice.length) fail("rules.species.skillChoice", "duplicate skill option");
		}
		if (rule.spellcastingAbility !== undefined) {
			if (!ABILITIES.includes(rule.spellcastingAbility)) fail("rules.species.spellcastingAbility", "unsupported ability");
			if (spellLineages.length) fail("rules.species.spellcastingAbility", "fixed ability with lineage spellcasting");
			if (!Array.isArray(rule.commonSpells) || !rule.commonSpells.length) fail("rules.species.spellcastingAbility", "fixed ability without spells");
		}
		array(rule.commonSpells, "rules.species.commonSpells");
		if (new Set(rule.commonSpells).size !== rule.commonSpells.length) fail("rules.species.commonSpells", "duplicate common spell");
		rule.commonSpells.forEach(uid => string(uid, "rules.species.commonSpells"));
		array(rule.savingThrowAdvantages, "rules.species.savingThrowAdvantages");
		const advantageAbilities = new Set();
		for (const advantage of rule.savingThrowAdvantages) {
			object(advantage, "rules.species.savingThrowAdvantages", ["ability", "condition", "feature"]);
			if (!ABILITIES.includes(advantage.ability) || advantage.condition !== null || advantageAbilities.has(advantage.ability)) fail("rules.species.savingThrowAdvantages", "unsupported or duplicate advantage");
			string(advantage.feature, "rules.species.savingThrowAdvantages.feature");
			advantageAbilities.add(advantage.ability);
		}
		const lineageIds = new Set();
		const lineageNames = new Set();
		for (const lineage of lineages) {
			object(lineage, "rules.species.lineages", ["id", "additionalSpellsName", "name", "resistance", "notes", "cantripOptions"]);
			if (typeof lineage.id !== "string" || !/^[a-z][a-z-]*$/.test(lineage.id) || lineageIds.has(lineage.id)) fail("rules.species.lineages.id", "invalid or duplicate lineage ID");
			if (lineage.additionalSpellsName === null) {
				if (lineage.name === undefined) fail("rules.species.lineages.name", "missing lineage name");
				string(lineage.name, "rules.species.lineages.name");
			} else {
				string(lineage.additionalSpellsName, "rules.species.lineages.additionalSpellsName");
				if (lineageNames.has(lineage.additionalSpellsName)) fail("rules.species.lineages", "duplicate spell group mapping");
				lineageNames.add(lineage.additionalSpellsName);
				if (lineage.name !== undefined) string(lineage.name, "rules.species.lineages.name");
			}
			if (lineage.resistance !== null && !["poison", "necrotic", "fire", "acid", "cold", "lightning"].includes(lineage.resistance)) fail("rules.species.lineages.resistance", "unsupported resistance");
			if (lineage.cantripOptions !== undefined) {
				array(lineage.cantripOptions, "rules.species.lineages.cantripOptions");
				if (!lineage.cantripOptions.length) fail("rules.species.lineages.cantripOptions", "missing cantrip options");
				lineage.cantripOptions.forEach(uid => string(uid, "rules.species.lineages.cantripOptions"));
				if (new Set(lineage.cantripOptions).size !== lineage.cantripOptions.length) fail("rules.species.lineages.cantripOptions", "duplicate cantrip option");
			}
			array(lineage.notes, "rules.species.lineages.notes");
			lineage.notes.forEach(note => string(note, "rules.species.lineages.notes"));
			lineageIds.add(lineage.id);
		}
	}
	if (refs.size !== SUPPORTED_REFS.length) fail("rules.species", "missing supported species annotations");
}

function normalizeGrants (group, lineage, ownerId, policy, spellIndex, collectedSpells, cantripOptions) {
	object(group, "additionalSpells", ["name", "ability", "known", "innate"]);
	object(group.ability, "additionalSpells.ability", ["choose"]);
	array(group.ability.choose, "additionalSpells.ability.choose");
	if (group.ability.choose.length !== 3 || new Set(group.ability.choose).size !== 3 || group.ability.choose.some(ability => !ABILITIES.includes(ability))) fail("additionalSpells.ability", "unsupported spellcasting ability choices");
	const grants = [];
	const choices = [];
	const grantIds = new Set();
	function addGrant (uid, minimumCharacterLevel, uses) {
		if (typeof uid !== "string") fail("additionalSpells", "unsupported spell reference");
		const match = /^([^|#]+)\|([^|#]+)(#c)?$/.exec(uid);
		if (!match) fail("additionalSpells", `unsupported spell reference ${uid}`);
		const key = `${match[1].toLowerCase()}|${match[2].toLowerCase()}`;
		const raw = spellIndex.get(key);
		if (!raw) fail("additionalSpells", `unknown spell reference ${key}`);
		integer(raw.level, `spell ${key}.level`, 0, 9);
		if ((match[3] && raw.level !== 0) || (uses === null && raw.level !== 0) || (uses !== null && raw.level === 0)) fail("additionalSpells", `unsupported spell level for ${key}`);
		const id = `spell:${slug(raw.name)}|${raw.source.toLowerCase()}`;
		if (grantIds.has(id)) fail("additionalSpells", `duplicate spell grant ${id}`);
		grantIds.add(id);
		if (!collectedSpells.has(id)) {
			collectedSpells.set(id, {
				id,
				ref: {name: raw.name, source: raw.source},
				level: raw.level,
				...spellMetadata(raw, key),
			});
		} else if (refKey(collectedSpells.get(id).ref) !== key) fail("spells", `colliding spell identifier ${id}`);
		grants.push({
			spellId: id,
			minimumCharacterLevel,
			alwaysPrepared: uses === null ? false : policy.alwaysPrepared,
			canCastWithSlots: uses === null ? false : policy.canCastWithSlots,
			resource: uses === null ? null : {id: `${ownerId}:${lineage.id}:${slug(raw.name)}`, uses, reset: policy.reset},
		});
	}
	function progression (value, path, visit) {
		object(value, path);
		for (const [key, entries] of Object.entries(value)) {
			if (!/^[1-5]$/.test(key)) fail(path, `unsupported character level ${key}`);
			visit(entries, Number(key));
		}
	}
	progression(group.known, "additionalSpells.known", (entries, level) => {
		let list = entries;
		if (list && typeof list === "object" && !Array.isArray(list)) {
			object(list, "additionalSpells.known", ["_"]);
			list = list._;
		}
		array(list, "additionalSpells.known");
		for (const entry of list) if (typeof entry === "string") addGrant(entry, level, null);
		const chosen = list.filter(entry => typeof entry !== "string");
		if (chosen.length > 1) fail("additionalSpells.known", "unsupported spell choices");
		for (const entry of chosen) {
			object(entry, "additionalSpells.known", ["choose", "count"]);
			if (typeof entry.choose !== "string" || !entry.choose.trim()) fail("additionalSpells.known.choose", "unsupported spell filter");
			if (entry.count !== undefined && (!Number.isSafeInteger(entry.count) || entry.count < 1)) fail("additionalSpells.known.count", "unsupported spell count");
			if (!Array.isArray(cantripOptions) || !cantripOptions.length) fail(`additionalSpells.known`, `unreviewed spell choice for ${lineage.id}`);
			const byId = new Map([...spellIndex.values()].map(raw => [`spell:${slug(raw.name)}|${raw.source.toLowerCase()}`, raw]));
			const options = cantripOptions.map(uid => {
				if (typeof uid !== "string" || !uid.trim()) fail(`species ${lineage.id}.cantripOptions`, "unsupported spell reference");
				const raw = uid.startsWith("spell:") ? byId.get(uid.toLowerCase()) : spellIndex.get(uid.toLowerCase());
				if (!raw || raw.level !== 0) fail(`species ${lineage.id}.cantripOptions`, `unsupported cantrip ${uid}`);
				const id = `spell:${slug(raw.name)}|${raw.source.toLowerCase()}`;
				const key = `${raw.name.toLowerCase()}|${raw.source.toLowerCase()}`;
				if (!collectedSpells.has(id)) collectedSpells.set(id, {id, ref: {name: raw.name, source: raw.source}, level: raw.level, ...spellMetadata(raw, key)});
				return id;
			});
			if (new Set(options).size !== options.length) fail(`species ${lineage.id}.cantripOptions`, "duplicate cantrip");
			choices.push({id: `${ownerId}:${lineage.id}:cantrip`, options: [...options], count: entry.count ?? 1, minimumCharacterLevel: level, abilityOptions: [...group.ability.choose]});
		}
	});
	if (group.innate !== undefined) {
		progression(group.innate, "additionalSpells.innate", (entry, level) => {
			object(entry, "additionalSpells.innate", ["daily"]);
			object(entry.daily, "additionalSpells.innate.daily");
			for (const [key, entries] of Object.entries(entry.daily)) {
				if (key !== "pb" && !/^[1-9][0-9]*$/.test(key)) fail("additionalSpells.innate.daily", `unsupported use count ${key}`);
				const uses = key === "pb" ? "proficiencyBonus" : Number(key);
				if (uses !== "proficiencyBonus") integer(uses, "additionalSpells.innate.daily", 1, 100);
				array(entries, "additionalSpells.innate.daily");
				entries.forEach(uid => addGrant(uid, level, uses));
			}
		});
	}
	return {abilityOptions: [...group.ability.choose], grants, choices};
}

/** Normalize the reviewed Gnome/Tiefling subset from parsed 5etools JSON. */
export function createSpeciesCatalog ({races, spells, rules}) {
	validateRules(rules);
	const raceIndex = indexEntities(races?.race, "races.race");
	const spellIndex = indexEntities(spells?.spell, "spells.spell");
	const collectedSpells = new Map();
	const species = rules.species.map(rule => {
		const key = refKey(rule.ref);
		const raw = raceIndex.get(key);
		if (!raw) fail("races.race", `missing species ${key}`);
		array(raw.size, `species ${key}.size`);
		if (!raw.size.length || raw.size.some(size => typeof size !== "string" || !Object.hasOwn(SIZES, size)) || new Set(raw.size).size !== raw.size.length) fail(`species ${key}.size`, "unsupported size options");
		integer(raw.speed, `species ${key}.speed`, 1);
		if (raw.darkvision !== undefined) integer(raw.darkvision, `species ${key}.darkvision`, 1);
		array(raw.creatureTypes, `species ${key}.creatureTypes`);
		raw.creatureTypes.forEach(type => string(type, `species ${key}.creatureTypes`));
		const lineages = rule.lineages === undefined ? [] : rule.lineages;
		const spellLineages = lineages.filter(lineage => lineage.additionalSpellsName !== null);
		const groups = new Map();
		if (raw.additionalSpells !== undefined) {
			array(raw.additionalSpells, `species ${key}.additionalSpells`);
			const namedGroups = raw.additionalSpells.filter(group => group.name !== undefined);
			const speciesGroups = raw.additionalSpells.filter(group => group.name === undefined);
			if (speciesGroups.length > 1) fail(`species ${key}.additionalSpells`, "duplicate species spell group");
			if (namedGroups.length !== spellLineages.length) fail(`species ${key}.additionalSpells`, "unmapped spell groups");
			for (const group of namedGroups) {
				string(group.name, "additionalSpells.name");
				if (groups.has(group.name)) fail("additionalSpells", "duplicate spell group");
				groups.set(group.name, group);
			}
			if (speciesGroups.length) {
				// A group without a name describes spells every member of the species
				// knows, such as the Aasimar's Light cantrip.
				const group = speciesGroups[0];
				if (typeof group.ability !== "string" || !ABILITIES.includes(group.ability)) fail(`species ${key}.additionalSpells.ability`, "unsupported fixed ability");
				if (rule.spellcastingAbility !== group.ability) fail(`species ${key}.spellcastingAbility`, "fixed ability disagrees with the source record");
				if (group.innate !== undefined) fail(`species ${key}.additionalSpells`, "unsupported species innate spells");
				const uids = new Set(Object.values(group.known || {}).flat().filter(value => typeof value === "string").map(uid => uid.replace(/#.*$/, "").toLowerCase()));
				if (JSON.stringify([...uids].sort()) !== JSON.stringify([...rule.commonSpells].map(uid => uid.toLowerCase()).sort())) fail(`species ${key}.commonSpells`, "common spells disagree with the source record");
			}
		} else if (spellLineages.length) fail(`species ${key}.additionalSpells`, "missing spell groups");
		const id = `species:${slug(raw.name)}|${raw.source.toLowerCase()}`;
		const resistanceOptions = raw.resist === undefined ? [] : raw.resist;
		let fixedResistances = [];
		const mappedResistances = new Set(lineages.map(lineage => lineage.resistance).filter(value => value !== null));
		if (raw.resist !== undefined) {
			array(resistanceOptions, `species ${key}.resist`);
			if (!resistanceOptions.length) fail(`species ${key}.resist`, "missing resistances");
			if (resistanceOptions.every(value => typeof value === "string")) {
				fixedResistances = [...resistanceOptions];
			} else {
				if (resistanceOptions.length !== 1) fail(`species ${key}.resist`, "unsupported resistance selection");
				object(resistanceOptions[0], `species ${key}.resist`, ["choose"]);
				object(resistanceOptions[0].choose, `species ${key}.resist.choose`, ["from"]);
				array(resistanceOptions[0].choose.from, `species ${key}.resist.choose.from`);
				const from = resistanceOptions[0].choose.from;
				if (!from.length || from.some(value => typeof value !== "string" || !value.trim()) || new Set(from).size !== from.length) fail(`species ${key}.resist.choose.from`, "invalid resistance options");
				if (from.length !== mappedResistances.size || from.some(value => !mappedResistances.has(value))) fail(`species ${key}.resist`, "resistance mapping disagrees with base species");
			}
		} else if (mappedResistances.size) fail(`species ${key}.resist`, "lineage resistances without a base species selection");
		const ruleResistances = rule.resistances === undefined ? [] : rule.resistances;
		if (fixedResistances.length && (!ruleResistances.length || ruleResistances.some(value => !fixedResistances.includes(value)) || fixedResistances.some(value => !ruleResistances.includes(value)))) fail(`species ${key}.resistances`, "resistance annotations disagree with base species");
		const lineageEntries = lineages.map(lineage => {
			if (lineage.additionalSpellsName === null) {
				if ((lineage.resistance === null && resistanceOptions.length && !fixedResistances.length) || (lineage.resistance !== null && !resistanceOptions[0]?.choose?.from?.includes(lineage.resistance))) fail(`species ${key}.lineages`, "resistance mapping disagrees with base species");
				return {id: lineage.id, name: lineage.name, resistances: lineage.resistance === null ? [] : [lineage.resistance], notes: [...lineage.notes], abilityOptions: [], grants: []};
			}
			const group = groups.get(lineage.additionalSpellsName);
			if (!group) fail(`species ${key}.lineages`, `missing spell group ${lineage.additionalSpellsName}`);
			if ((lineage.resistance === null && resistanceOptions.length && !fixedResistances.length) || (lineage.resistance !== null && !resistanceOptions[0]?.choose?.from?.includes(lineage.resistance))) fail(`species ${key}.lineages`, "resistance mapping disagrees with base species");
			return {
				id: lineage.id,
				name: lineage.name ?? lineage.additionalSpellsName,
				resistances: lineage.resistance === null ? [] : [lineage.resistance],
				notes: [...lineage.notes],
				...normalizeGrants(group, lineage, id, rule.leveledSpellPolicy, spellIndex, collectedSpells, lineage.cantripOptions),
			};
		});
		const baseGrants = rule.commonSpells.map(uid => {
			const rawSpell = spellIndex.get(uid.toLowerCase());
			if (!rawSpell || rawSpell.level !== 0) fail(`species ${key}.commonSpells`, "unsupported common spell");
			const spellId = `spell:${slug(rawSpell.name)}|${rawSpell.source.toLowerCase()}`;
			if (!lineageEntries.length) {
				if (!rule.spellcastingAbility) fail(`species ${key}.commonSpells`, "common spell without a spellcasting ability");
				if (!collectedSpells.has(spellId)) collectedSpells.set(spellId, {id: spellId, ref: {name: rawSpell.name, source: rawSpell.source}, level: rawSpell.level, ...spellMetadata(rawSpell, uid.toLowerCase())});
				return {spellId, minimumCharacterLevel: 1, alwaysPrepared: false, canCastWithSlots: false, resource: null};
			}
			const grant = lineageEntries[0]?.grants.find(candidate => candidate.spellId === spellId);
			if (!grant || grant.minimumCharacterLevel !== 1 || grant.resource !== null || lineageEntries.some(lineage => !lineage.grants.some(candidate => JSON.stringify(candidate) === JSON.stringify(grant)))) fail(`species ${key}.commonSpells`, "common spell is not consistently granted by every spell group");
			for (const lineage of lineageEntries) lineage.grants = lineage.grants.filter(candidate => candidate.spellId !== spellId);
			return grant;
		});
		const grantsSpells = baseGrants.length > 0 || lineageEntries.some(lineage => lineage.grants.length > 0);
		return {
			id,
			ref: {name: raw.name, source: raw.source},
			sizes: raw.size.map(size => SIZES[size]),
			speed: raw.speed,
			darkvision: raw.darkvision ?? 0,
			creatureTypes: [...raw.creatureTypes],
			lineageChoiceId: lineageEntries.length ? `${id}:${rule.lineageChoice}` : null,
			lineageLabel: lineageEntries.length ? rule.lineageLabel : null,
			abilityChoiceId: grantsSpells && rule.spellcastingAbility === undefined ? `${id}:spellcasting-ability` : null,
			spellcastingAbility: rule.spellcastingAbility ?? null,
			sizeChoiceId: raw.size.length > 1 ? `${id}:size` : null,
			skillChoiceId: rule.skillChoice === undefined ? null : `${id}:skill`,
			skillOptions: rule.skillChoice === undefined ? [] : [...rule.skillChoice],
			featChoiceId: rule.featChoice === undefined ? null : `${id}:feat`,
			featOptions: rule.featChoice === undefined ? [] : [...rule.featChoice.options],
			featWithheld: rule.featChoice?.withheld ?? null,
			savingThrowAdvantages: copy(rule.savingThrowAdvantages),
			resistances: [...fixedResistances],
			hpPerLevel: rule.hpPerLevel ?? 0,
			provenance: copy(rule.provenance),
			baseGrants,
			lineages: lineageEntries,
		};
	});
	return {schemaVersion: SPECIES_CATALOG_VERSION, ruleset: "2024", dataset: copy(rules.dataset), sources: copy(rules.sources), species, spells: [...collectedSpells.values()]};
}
