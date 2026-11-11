export const CHARACTER_DOCUMENT_VERSION = 1;

export const ABILITY_IDS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9:_./|%'-]*$/;

function fail (path, message) {
	throw new TypeError(`${path}: ${message}`);
}

function object (value, path, keys) {
	if (!value || typeof value !== "object" || Array.isArray(value)
		|| ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "expected a plain object");
	for (const key of Reflect.ownKeys(value)) {
		if (!keys.includes(key)) fail(path, `unexpected field ${String(key)}`);
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(path, "expected JSON data fields");
	}
	for (const key of keys) {
		if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "missing field");
	}
}

function string (value, path, maxLength = 200) {
	if (typeof value !== "string" || !value.trim() || value.length > maxLength) fail(path, `expected a non-empty string of at most ${maxLength} characters`);
}

function identifier (value, path) {
	string(value, path);
	if (!ID_PATTERN.test(value)) fail(path, "expected a stable lowercase identifier");
}

function integer (value, path, min, max = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, `expected an integer between ${min} and ${max}`);
}

function entity (value, path) {
	object(value, path, ["name", "source"]);
	string(value.name, `${path}.name`);
	string(value.source, `${path}.source`, 50);
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.source)) fail(`${path}.source`, "invalid source identifier");
}

function array (value, path) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(path, "expected a plain JSON array");
	const keys = Reflect.ownKeys(value);
	if (keys.length !== value.length + 1) fail(path, "expected a dense JSON array without extra fields");
	for (const key of keys) {
		if (key === "length") continue;
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)
			|| !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(path, "expected JSON array data fields");
	}
}

function uniqueRecords (value, path, validate) {
	array(value, path);
	const ids = new Set();
	for (const [index, entry] of value.entries()) {
		const entryPath = `${path}[${index}]`;
		validate(entry, entryPath);
		if (ids.has(entry.id)) fail(`${entryPath}.id`, "duplicate identifier");
		ids.add(entry.id);
	}
}

/**
 * Check the v1 draft save format. This does not validate D&D build legality,
 * resolve catalog references, or calculate a character sheet.
 * @returns {true} Throws TypeError on an unsupported or malformed document.
 */
export function validateCharacterDocument (document) {
	object(document, "character", ["schemaVersion", "id", "name", "status", "ruleset", "dataset", "build", "session"]);
	if (document.schemaVersion !== CHARACTER_DOCUMENT_VERSION) fail("character.schemaVersion", "unsupported document version");
	if (typeof document.id !== "string" || document.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id)) fail("character.id", "expected a lowercase character slug of at most 80 characters");
	string(document.name, "character.name");
	if (document.status !== "draft") fail("character.status", "v1 supports draft characters only");
	if (document.ruleset !== "2024") fail("character.ruleset", "unsupported ruleset");
	object(document.dataset, "character.dataset", ["id", "version", "revision"]);
	if (document.dataset.id !== "5etools") fail("character.dataset.id", "unsupported dataset");
	string(document.dataset.version, "character.dataset.version", 50);
	if (typeof document.dataset.revision !== "string" || !/^[a-f0-9]{40}$/.test(document.dataset.revision)) fail("character.dataset.revision", "expected a Git commit SHA");

	const {build} = document;
	object(build, "character.build", ["level", "class", "species", "background", "abilities", "choices"]);
	integer(build.level, "character.build.level", 1, 20);
	entity(build.class, "character.build.class");
	entity(build.species, "character.build.species");
	if (build.background !== null) entity(build.background, "character.build.background");
	object(build.abilities, "character.build.abilities", ["method", "scores"]);
	if (!["standard", "pointBuy", "manual"].includes(build.abilities.method)) fail("character.build.abilities.method", "unsupported ability score method");
	if (build.abilities.scores !== null) {
		object(build.abilities.scores, "character.build.abilities.scores", ABILITY_IDS);
		for (const ability of ABILITY_IDS) integer(build.abilities.scores[ability], `character.build.abilities.scores.${ability}`, 1, 30);
	}
	uniqueRecords(build.choices, "character.build.choices", (choice, path) => {
		object(choice, path, ["id", "selected"]);
		identifier(choice.id, `${path}.id`);
		array(choice.selected, `${path}.selected`);
		for (const [index, selected] of choice.selected.entries()) identifier(selected, `${path}.selected[${index}]`);
		if (new Set(choice.selected).size !== choice.selected.length) fail(`${path}.selected`, "duplicate selection");
	});

	const {session} = document;
	object(session, "character.session", ["hp", "resources", "notes"]);
	object(session.hp, "character.session.hp", ["current", "temporary"]);
	if (session.hp.current !== null) integer(session.hp.current, "character.session.hp.current", 0);
	integer(session.hp.temporary, "character.session.hp.temporary", 0);
	uniqueRecords(session.resources, "character.session.resources", (resource, path) => {
		object(resource, path, ["id", "spent"]);
		identifier(resource.id, `${path}.id`);
		integer(resource.spent, `${path}.spent`, 0);
	});
	if (typeof session.notes !== "string" || session.notes.length > 10000) fail("character.session.notes", "expected a string of at most 10000 characters");
	return true;
}

/** Serialize only a validated save document; derived sheet fields are rejected. */
export function serializeCharacterDocument (document) {
	validateCharacterDocument(document);
	return `${JSON.stringify(document, null, "\t")}\n`;
}

/** Parse a new document without changing any existing character or storage. */
export function parseCharacterDocument (text) {
	if (typeof text !== "string") fail("character", "expected JSON text");
	let document;
	try {
		document = JSON.parse(text);
	} catch (error) {
		throw new TypeError("character: invalid JSON", {cause: error});
	}
	validateCharacterDocument(document);
	return document;
}
