import {readFileSync} from "node:fs";
import {
	parseCharacterDocument,
	serializeCharacterDocument,
	validateCharacterDocument,
} from "../../../js/character-builder/character-document.js";

const loadFixture = name => JSON.parse(readFileSync(new URL(`../../fixtures/character-builder/${name}.json`, import.meta.url), "utf8"));
const getArray = (document, field) => ({
	choices: document.build.choices,
	selected: document.build.choices[0].selected,
	resources: document.session.resources,
})[field];

describe("Character builder draft documents", () => {
	it.each(["gnome-fighter-draft", "tiefling-warlock-draft"])("round-trips %s without losing decisions or play state", name => {
		const original = loadFixture(name);
		const saved = serializeCharacterDocument(original);
		const restored = parseCharacterDocument(saved);
		expect(restored).toEqual(original);
		expect(restored).not.toBe(original);
		expect(restored.build).not.toBe(original.build);
	});

	it("keeps characters and independently granted resources separate", () => {
		const fighter = loadFixture("gnome-fighter-draft");
		const warlock = parseCharacterDocument(serializeCharacterDocument(loadFixture("tiefling-warlock-draft")));
		const originalFighter = structuredClone(fighter);
		warlock.session.resources[0].spent = 0;
		warlock.session.notes = "Changed only this character";
		expect(fighter).toEqual(originalFighter);
		expect(warlock.session.resources.map(resource => resource.spent)).toEqual([0, 1, 0]);
		// Species casting can use INT independently of the Warlock's CHA casting.
		expect(warlock.build.choices.find(choice => choice.id.endsWith("spellcasting-ability")).selected).toEqual(["int"]);
	});

	it("does not mutate its input while validating or serializing", () => {
		const document = loadFixture("tiefling-warlock-draft");
		const before = structuredClone(document);
		expect(validateCharacterDocument(document)).toBe(true);
		serializeCharacterDocument(document);
		expect(document).toEqual(before);
	});

	it.each([0, 2, "1", null])("rejects unsupported schema version %s", version => {
		const document = loadFixture("gnome-fighter-draft");
		document.schemaVersion = version;
		expect(() => parseCharacterDocument(JSON.stringify(document))).toThrow("unsupported document version");
	});

	it.each(["2014", "2025"])("rejects unsupported ruleset %s", ruleset => {
		const document = loadFixture("gnome-fighter-draft");
		document.ruleset = ruleset;
		expect(() => validateCharacterDocument(document)).toThrow("unsupported ruleset");
	});

	it.each(["", "{", "null", "[]", "42"])("rejects malformed or non-document JSON %s", text => {
		expect(() => parseCharacterDocument(text)).toThrow(TypeError);
	});

	it.each([NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid resource count %s before JSON can change it", spent => {
		const document = loadFixture("tiefling-warlock-draft");
		document.session.resources[0].spent = spent;
		expect(() => serializeCharacterDocument(document)).toThrow("expected an integer");
	});

	it.each([0, 6, 1.5])("rejects unsupported character level %s", level => {
		const document = loadFixture("gnome-fighter-draft");
		document.build.level = level;
		expect(() => validateCharacterDocument(document)).toThrow("character.build.level");
	});

	it.each(["sheet", "catalog", "derived"])("rejects saved %s data instead of trusting cached calculations", field => {
		const document = loadFixture("gnome-fighter-draft");
		document[field] = {maxHp: 999};
		expect(() => serializeCharacterDocument(document)).toThrow(`unexpected field ${field}`);
	});

	it("rejects unknown nested fields and incomplete source references", () => {
		const document = loadFixture("gnome-fighter-draft");
		document.build.species.saveBonus = 5;
		expect(() => validateCharacterDocument(document)).toThrow("unexpected field saveBonus");
		delete document.build.species.saveBonus;
		delete document.build.species.source;
		expect(() => validateCharacterDocument(document)).toThrow("character.build.species.source: missing field");
	});

	it("rejects duplicate resources, choices, and selected values", () => {
		const document = loadFixture("tiefling-warlock-draft");
		document.session.resources.push(JSON.parse(JSON.stringify(document.session.resources[0])));
		expect(() => validateCharacterDocument(document)).toThrow("duplicate identifier");
		document.session.resources.pop();
		document.build.choices.push(JSON.parse(JSON.stringify(document.build.choices[0])));
		expect(() => validateCharacterDocument(document)).toThrow("duplicate identifier");
		document.build.choices.pop();
		document.build.choices[0].selected.push("infernal");
		expect(() => validateCharacterDocument(document)).toThrow("duplicate selection");
	});

	it.each(["", "../", "a/../../", "Localized Name", "__proto__"])("rejects invalid character ID %s", id => {
		const document = loadFixture("gnome-fighter-draft");
		document.id = id;
		expect(() => validateCharacterDocument(document)).toThrow("character.id");
	});

	it("keeps an existing character intact when an import fails", () => {
		const existing = loadFixture("tiefling-warlock-draft");
		const before = structuredClone(existing);
		const invalid = structuredClone(existing);
		invalid.session.hp.current = -1;
		expect(() => parseCharacterDocument(JSON.stringify(invalid))).toThrow("character.session.hp.current");
		expect(existing).toEqual(before);
	});

	it("rejects executable properties without invoking them", () => {
		const document = loadFixture("gnome-fighter-draft");
		Object.defineProperty(document, "name", {enumerable: true, get: () => { throw new Error("Must not run"); }});
		expect(() => serializeCharacterDocument(document)).toThrow("expected JSON data fields");
	});

	it.each(["choices", "selected", "resources"])("rejects %s array serialization hooks without invoking them", field => {
		const document = loadFixture("tiefling-warlock-draft");
		let called = false;
		getArray(document, field).toJSON = () => { called = true; return []; };
		expect(() => serializeCharacterDocument(document)).toThrow("JSON array");
		expect(called).toBe(false);
	});

	it.each(["choices", "selected", "resources"])("rejects %s array getters without invoking them", field => {
		const document = loadFixture("tiefling-warlock-draft");
		let called = false;
		Object.defineProperty(getArray(document, field), "0", {enumerable: true, get: () => { called = true; return "bad"; }});
		expect(() => serializeCharacterDocument(document)).toThrow("JSON array data fields");
		expect(called).toBe(false);
	});

	it.each(["choices", "selected", "resources"])("rejects extra %s array fields instead of silently dropping them", field => {
		const document = loadFixture("tiefling-warlock-draft");
		getArray(document, field).extra = "would be lost";
		expect(() => serializeCharacterDocument(document)).toThrow("JSON array");
	});

	it.each(["choices", "selected", "resources"])("rejects sparse %s arrays instead of inserting null values", field => {
		const document = loadFixture("tiefling-warlock-draft");
		delete getArray(document, field)[0];
		expect(() => serializeCharacterDocument(document)).toThrow("dense JSON array");
	});

	it("rejects array subclasses before their inherited serialization hooks can run", () => {
		class CustomArray extends Array {
			toJSON () { throw new Error("Must not run"); }
		}
		const document = loadFixture("gnome-fighter-draft");
		document.build.choices = new CustomArray(...document.build.choices);
		expect(() => serializeCharacterDocument(document)).toThrow("expected a plain JSON array");
	});
});
