export const SPECIES_CATALOG_VERSION = 1;

const SIZES = {S: "small", M: "medium"};
const ABILITIES = ["int", "wis", "cha"];
const SUPPORTED_REFS = ["dragonborn|xphb", "dwarf|xphb", "gnome|xphb", "goliath|xphb", "halfling|xphb", "orc|xphb", "tiefling|xphb"];

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
	if (raw.scalingLevelDice !== undefined) object(raw.scalingLevelDice, `spell ${key}.scalingLevelDice`);
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
		object(rule, "rules.species", ["ref", "provenance", "lineageChoice", "lineageLabel", "commonSpells", "savingThrowAdvantages", "leveledSpellPolicy", "lineages", "resistances", "hpPerLevel"]);
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
			object(lineage, "rules.species.lineages", ["id", "additionalSpellsName", "name", "resistance", "notes"]);
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
			array(lineage.notes, "rules.species.lineages.notes");
			lineage.notes.forEach(note => string(note, "rules.species.lineages.notes"));
			lineageIds.add(lineage.id);
		}
	}
	if (refs.size !== SUPPORTED_REFS.length) fail("rules.species", "missing supported species annotations");
}

function normalizeGrants (group, lineage, ownerId, policy, spellIndex, collectedSpells) {
	object(group, "additionalSpells", ["name", "ability", "known", "innate"]);
	object(group.ability, "additionalSpells.ability", ["choose"]);
	array(group.ability.choose, "additionalSpells.ability.choose");
	if (group.ability.choose.length !== 3 || new Set(group.ability.choose).size !== 3 || group.ability.choose.some(ability => !ABILITIES.includes(ability))) fail("additionalSpells.ability", "unsupported spellcasting ability choices");
	const grants = [];
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
		array(entries, "additionalSpells.known");
		entries.forEach(uid => addGrant(uid, level, null));
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
	return {abilityOptions: [...group.ability.choose], grants};
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
			if (raw.additionalSpells.length !== spellLineages.length) fail(`species ${key}.additionalSpells`, "unmapped spell groups");
			for (const group of raw.additionalSpells) {
				string(group.name, "additionalSpells.name");
				if (groups.has(group.name)) fail("additionalSpells", "duplicate spell group");
				groups.set(group.name, group);
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
				...normalizeGrants(group, lineage, id, rule.leveledSpellPolicy, spellIndex, collectedSpells),
			};
		});
		const baseGrants = rule.commonSpells.map(uid => {
			const rawSpell = spellIndex.get(uid.toLowerCase());
			if (!rawSpell || rawSpell.level !== 0) fail(`species ${key}.commonSpells`, "unsupported common spell");
			const spellId = `spell:${slug(rawSpell.name)}|${rawSpell.source.toLowerCase()}`;
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
			abilityChoiceId: grantsSpells ? `${id}:spellcasting-ability` : null,
			sizeChoiceId: raw.size.length > 1 ? `${id}:size` : null,
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
