import {SCHOOL_NAMES, option, spellOptionDetail} from "./choice-common.js";

/**
 * Reviewed spell choices taken from the site's own spell data.
 *
 * Spell lists are never copied by hand. A class table or feat names the 5etools
 * filter expression it already uses (`level=0|class=Cleric`), and this module
 * evaluates that expression against the pinned spell files and the generated
 * class-list lookup. Unsupported filters are rejected instead of ignored, so a
 * data change cannot silently widen a reviewed list.
 */

export const SPELL_CATALOG_VERSION = 1;

const SPELL_TAGS = new Set(["ritual", "concentration", "verbal", "somatic", "material"]);
const COMPONENT_TAGS = Object.freeze({verbal: "v", somatic: "s", material: "m"});
const SCHOOL_IDS = new Map(Object.entries(SCHOOL_NAMES).map(([id, name]) => [name.toLowerCase(), id]));

const slug = value => value.toLowerCase().replaceAll(" ", "-");
const spellId = spell => `spell:${slug(spell.name)}|${spell.source.toLowerCase()}`;

function fail (message) {
	throw new TypeError(`spellQuery: ${message}`);
}

function schoolId (value) {
	if (typeof value !== "string" || !value.trim()) return null;
	const text = value.trim();
	const id = text.toUpperCase();
	if (Object.hasOwn(SCHOOL_NAMES, id)) return id;
	return SCHOOL_IDS.get(text.toLowerCase()) || null;
}

/**
 * Read one spell record and its class memberships. Variant class definers are
 * skipped: only a plain `true` membership puts a spell on a class list.
 */
function readSpell (raw, path, lookup) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError(`${path}: expected a spell record`);
	if (typeof raw.name !== "string" || !raw.name.trim()) throw new TypeError(`${path}.name: expected a non-empty string`);
	if (typeof raw.source !== "string" || !raw.source.trim()) throw new TypeError(`${path}.source: expected a non-empty string`);
	if (!Number.isSafeInteger(raw.level) || raw.level < 0 || raw.level > 9) throw new TypeError(`${path}.level: expected a spell level from 0 to 9`);
	if (!Object.hasOwn(SCHOOL_NAMES, `${raw.school ?? ""}`)) throw new TypeError(`${path}.school: unsupported spell school`);
	if (!Array.isArray(raw.duration)) throw new TypeError(`${path}.duration: expected a duration list`);
	if (!raw.components || typeof raw.components !== "object" || Array.isArray(raw.components)) throw new TypeError(`${path}.components: expected an object`);
	if (raw.meta?.ritual !== undefined && typeof raw.meta.ritual !== "boolean") throw new TypeError(`${path}.meta.ritual: expected a boolean`);
	const memberships = lookup?.[raw.source.toLowerCase()]?.[raw.name.toLowerCase()]?.class;
	if (memberships !== undefined && (!memberships || typeof memberships !== "object" || Array.isArray(memberships))) throw new TypeError(`${path}: unsupported generated class list`);
	const classes = [];
	for (const [source, records] of Object.entries(memberships || {})) {
		if (!records || typeof records !== "object" || Array.isArray(records)) throw new TypeError(`${path}: unsupported generated class list for ${source}`);
		for (const [name, membership] of Object.entries(records)) if (membership === true) classes.push(Object.freeze({name, source}));
	}
	return Object.freeze({
		id: spellId(raw),
		name: raw.name,
		source: raw.source,
		level: raw.level,
		school: raw.school,
		ritual: raw.meta?.ritual === true,
		concentration: raw.duration.some(value => value?.concentration === true),
		components: Object.freeze({v: raw.components.v === true, s: raw.components.s === true, m: raw.components.m != null && raw.components.m !== false, r: raw.components.r === true}),
		classes: Object.freeze(classes),
		page: Number.isSafeInteger(raw.page) ? raw.page : null,
	});
}

/** Index the pinned spell files together with their class memberships. */
export function createSpellCatalog ({spells, lookup} = {}) {
	const records = Array.isArray(spells) ? spells : spells?.spell;
	if (!Array.isArray(records) || !records.length) throw new TypeError("spells: expected the parsed spell data or an array of spells");
	if (!lookup || typeof lookup !== "object" || Array.isArray(lookup)) throw new TypeError("lookup: expected the generated spell class lookup");
	const byId = new Map();
	for (const [index, record] of records.entries()) {
		const spell = readSpell(record, `spells[${index}]`, lookup);
		if (byId.has(spell.id)) throw new TypeError(`spells: duplicate reference ${spell.id}`);
		byId.set(spell.id, spell);
	}
	const list = [...byId.values()].sort((left, right) => left.level - right.level || left.name.localeCompare(right.name));
	return Object.freeze({schemaVersion: SPELL_CATALOG_VERSION, spells: Object.freeze(list), byId});
}

/**
 * The loaded spell records and lookup are immutable for the life of the page,
 * so one catalog per pair is reused instead of rebuilt on every render.
 */
const catalogCache = new WeakMap();

/**
 * Use the catalog the page already prepared, or build one from the loaded spell
 * files and the generated class lookup. Return `null` when the data are absent
 * so callers report the gap instead of presenting an empty list.
 */
export function resolveSpellCatalog ({spellCatalog, spells, sources} = {}) {
	if (spellCatalog) return spellCatalog;
	const records = Array.isArray(spells) ? spells : spells?.spell;
	if (!sources?.spellLookup || !records) return null;
	let byLookup = catalogCache.get(records);
	if (!byLookup) {
		byLookup = new WeakMap();
		catalogCache.set(records, byLookup);
	}
	const cached = byLookup.get(sources.spellLookup);
	if (cached) return cached;
	const catalog = createSpellCatalog({spells: records, lookup: sources.spellLookup});
	byLookup.set(sources.spellLookup, catalog);
	return catalog;
}

function readLevel (value) {
	const match = /^(!?)([0-9])$/.exec(value);
	if (!match) fail(`unsupported spell level "${value}"`);
	return {level: Number(match[2]), negated: match[1] === "!"};
}

function readClass (value) {
	const name = value.trim();
	if (!name) fail(`unsupported class "${value}"`);
	return {name: name.toLowerCase()};
}

function readSchool (value) {
	const id = schoolId(value);
	if (!id) fail(`unsupported school "${value}"`);
	return id;
}

function readTag (value) {
	const tag = value.toLowerCase();
	if (!SPELL_TAGS.has(tag)) fail(`unsupported spell tag "${value}"`);
	return {tag, expected: true};
}

function readBooleanTag (key, value) {
	const text = value.toLowerCase();
	if (text !== "true" && text !== "false") fail(`expected true or false for "${key}"`);
	return {tag: key, expected: text === "true"};
}

/** Read one filter term such as `level=1` or `components & miscellaneous=ritual`. */
function readTerm (text) {
	const match = /^([^=]+?)=(.+)$/.exec(text);
	if (!match) fail(`unsupported term "${text}"`);
	const key = match[1].trim().toLowerCase().replace(/\s+/g, " ");
	const values = match[2].split(/[;,]/).map(value => value.trim()).filter(Boolean);
	if (!values.length) fail(`missing values for "${match[1].trim()}"`);
	switch (key) {
		case "level": return {kind: "level", values: values.map(readLevel)};
		case "class": return {kind: "class", values: values.map(readClass)};
		case "school": return {kind: "school", values: values.map(readSchool)};
		case "source": return {kind: "source", values: values.map(value => value.toLowerCase())};
		case "components & miscellaneous": return {kind: "tag", values: values.map(readTag)};
		case "ritual":
		case "concentration": return {kind: "tag", values: values.map(value => readBooleanTag(key, value))};
	}
	return fail(`unsupported filter "${match[1].trim()}"`);
}

/** Parse one reviewed 5etools spell-filter expression into matchable terms. */
export function parseSpellQuery (query) {
	if (typeof query !== "string" || !query.trim()) fail("expected a non-empty filter expression");
	return query.split("|").map(part => readTerm(part.trim()));
}

const hasTag = (spell, tag) => tag === "ritual" ? spell.ritual
	: tag === "concentration" ? spell.concentration
		: Boolean(spell.components[COMPONENT_TAGS[tag]]);

/** True when a spell satisfies one parsed filter term. */
function matchesTerm (spell, term) {
	switch (term.kind) {
		case "level": return term.values.some(value => value.negated ? spell.level !== value.level : spell.level === value.level);
		case "class": return term.values.some(value => spell.classes.some(entry => entry.name.toLowerCase() === value.name));
		case "school": return term.values.includes(spell.school);
		case "source": return term.values.includes(spell.source.toLowerCase());
	}
	return term.values.some(value => hasTag(spell, value.tag) === value.expected);
}

/** Evaluate one reviewed filter expression and return the matching spells. */
export function selectSpells (catalog, query) {
	if (!catalog?.byId || !(catalog.byId instanceof Map)) throw new TypeError("catalog: expected a spell catalog");
	const terms = parseSpellQuery(query);
	return catalog.spells.filter(spell => terms.every(term => matchesTerm(spell, term)));
}

/** Describe one matching spell as a choice option without replacing its name. */
function spellChoiceOption (spell) {
	const detail = spellOptionDetail({level: spell.level, school: SCHOOL_NAMES[spell.school]});
	return {...option(spell.id, spell.name), ...(detail ? {detail} : {}), spell};
}

/** Build selection options for one reviewed filter expression. */
export function getSpellQueryOptions (catalog, query) {
	return selectSpells(catalog, query).map(spell => spellChoiceOption(spell));
}

/** Read one search token, or `null` when the token is free text. */
function readSearchToken (token) {
	const text = token.trim();
	if (!text) return null;
	if (!text.includes("=")) {
		const tag = text.toLowerCase();
		return SPELL_TAGS.has(tag) ? {kind: "tag", values: [{tag, expected: true}]} : null;
	}
	try {
		return readTerm(text);
	} catch {
		return null;
	}
}

/**
 * Narrow spell options with the filter vocabulary the site uses, plus free
 * text. Both `|` and spaces separate filters, matching the expressions stored in
 * the source data, so a copied `level=1|class=Warlock` narrows the same list.
 * Every token must match; `level=0;1` keeps cantrips and first-level spells.
 */
export function filterSpellOptions (options, query) {
	const text = `${query ?? ""}`.trim();
	if (!text) return options;
	const terms = [];
	const needles = [];
	for (const token of text.replaceAll("|", " ").split(/\s+/)) {
		const term = readSearchToken(token);
		if (term) terms.push(term);
		else needles.push(token.toLowerCase());
	}
	return options.filter(entry => entry.spell
		&& needles.every(needle => `${entry.label} ${entry.detail || ""}`.toLowerCase().includes(needle))
		&& terms.every(term => matchesTerm(entry.spell, term)));
}
