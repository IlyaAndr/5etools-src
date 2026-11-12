import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpellCatalog} from "../../../js/character-builder/spell-catalog.js";
import {getWarlockChoiceDescriptors, getWarlockSubclasses, getSubclassSpellGrants} from "../../../js/character-builder/warlock-choices.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const sources = {
	skills: readJson("../../../data/skills.json"),
	abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
	races: readJson("../../../data/races.json"),
	fighter: readJson("../../../data/class/class-fighter.json"),
	backgrounds: readJson("../../../data/backgrounds.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
	spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
};
const catalog = createSpeciesCatalog({races: sources.races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const spellCatalog = createSpellCatalog({spells, lookup: sources.spellLookup});
const context = {rules: readJson("../../../js/character-builder/rules/character-sheet.json"), spells, sources};
const clone = value => JSON.parse(JSON.stringify(value));
const levelThree = () => clone(createSheetExamples(catalog.dataset).find(example => example.id === "infernal-tiefling-warlock-level-3").document);
const levelFive = () => clone(createSheetExamples(catalog.dataset).find(example => example.id === "infernal-tiefling-warlock-level-5").document);
const subclassId = "class:warlock|xphb:subclass";
const subclass = name => getWarlockSubclasses(sources).find(entry => entry.name === name);

describe("XPHB Warlock patrons", () => {
	it("offers all four reviewed patrons as a level-3 choice", () => {
		expect(getWarlockSubclasses(sources).map(entry => `${entry.name}:${entry.id}`)).toEqual([
			"Archfey:archfey|xphb", "Celestial:celestial|xphb", "Fiend:fiend|xphb", "Great Old One:great-old-one|xphb",
		]);
		const descriptor = getWarlockChoiceDescriptors(levelThree(), catalog, context).find(entry => entry.id === subclassId);
		expect(descriptor.count).toBe(1);
		expect(descriptor.minimumLevel).toBe(3);
		expect(descriptor.options.map(option => option.id)).toEqual(["archfey|xphb", "celestial|xphb", "fiend|xphb", "great-old-one|xphb"]);
	});

	it("derives every patron's expanded spell list from its source record", () => {
		const fiend = getSubclassSpellGrants(subclass("Fiend"), spellCatalog);
		expect(fiend.known).toEqual([]);
		expect(fiend.prepared.map(grant => grant.minimumLevel)).toEqual([3, 5, 7, 9]);
		expect(fiend.prepared[0].spells).toEqual(["spell:burning-hands|xphb", "spell:command|xphb", "spell:scorching-ray|xphb", "spell:suggestion|xphb"]);
		expect(fiend.prepared[3].spells).toEqual(["spell:geas|xphb", "spell:insect-plague|xphb"]);

		const celestial = getSubclassSpellGrants(subclass("Celestial"), spellCatalog);
		expect(celestial.known).toEqual(["spell:sacred-flame|xphb", "spell:light|xphb"]);
		expect(celestial.prepared[0].spells).toContain("spell:cure-wounds|xphb");

		expect(getSubclassSpellGrants(subclass("Archfey"), spellCatalog).prepared[0].spells).toContain("spell:misty-step|xphb");
		expect(getSubclassSpellGrants(subclass("Great Old One"), spellCatalog).prepared[1].spells).toContain("spell:hunger-of-hadar|xphb");

		expect(fiend.innate).toEqual([]);
		expect(celestial.innate).toEqual([]);
		expect(getSubclassSpellGrants(subclass("Archfey"), spellCatalog).innate).toEqual([
			{minimumLevel: 3, spellId: "spell:misty-step|xphb", uses: 1, ability: "cha"},
		]);
		expect(getSubclassSpellGrants(subclass("Great Old One"), spellCatalog).innate).toEqual([
			{minimumLevel: 10, spellId: "spell:hex|xphb", uses: 1, ability: null},
		]);
	});

	it("tracks a patron innate free cast as a resource", () => {
		const document = setCharacterChoice(levelThree(), subclassId, ["archfey|xphb"]);
		const model = createCharacterSheetModel(document, catalog, context);
		const resource = model.resources.find(candidate => candidate.spellId === "spell:misty-step|xphb");
		expect(resource).toMatchObject({maxUses: 1, freeLevel: 2, spellcastingAbility: "cha", recovery: {long: "all"}});
		const spell = model.spells.find(candidate => candidate.id === "spell:misty-step|xphb");
		expect(spell.sources.some(source => source.resourceId === resource.id && source.freeLevel === 2)).toBe(true);
	});

	it("rejects unknown spells and unsupported source shapes", () => {
		const unknown = clone(subclass("Fiend"));
		unknown.record.additionalSpells[0].prepared[3][0] = "not a spell|xphb";
		expect(() => getSubclassSpellGrants(unknown, spellCatalog)).toThrow(/Unknown subclass spell/);

		const malformed = clone(subclass("Archfey"));
		malformed.record.additionalSpells[0].prepared[3] = "misty step|xphb";
		expect(() => getSubclassSpellGrants(malformed, spellCatalog)).toThrow(/Unsupported Archfey prepared spells/);

		const weekly = clone(subclass("Archfey"));
		weekly.record.additionalSpells[0].innate = {3: {weekly: {1: ["misty step|xphb"]}}};
		expect(() => getSubclassSpellGrants(weekly, spellCatalog)).toThrow(/Unsupported Archfey innate recharge weekly/);

		const badCount = clone(subclass("Archfey"));
		badCount.record.additionalSpells[0].innate = {3: {daily: {strange: ["misty step|xphb"]}}};
		expect(() => getSubclassSpellGrants(badCount, spellCatalog)).toThrow(/Unsupported Archfey innate use count strange/);

		expect(() => getSubclassSpellGrants({name: "Fiend"})).toThrow(/Missing reviewed subclass record/);
	});

	it.each([
		["Archfey", "Archfey", "Steps of the Fey", "spell:misty-step|xphb"],
		["Celestial", "Celestial", "Healing Light", "spell:sacred-flame|xphb"],
		["Fiend", "Fiend", "Dark One's Blessing", "spell:burning-hands|xphb"],
		["Great Old One", "Great Old One", "Awakened Mind", "spell:detect-thoughts|xphb"],
	])("builds a complete level-3 %s patron sheet", (id, name, featureName, spellId) => {
		const document = setCharacterChoice(levelThree(), subclassId, [`${id.toLowerCase().replaceAll(" ", "-")}|xphb`]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.subclassName).toBe(name);
		expect(model.features.some(feature => feature.name === `${name} Patron`)).toBe(true);
		expect(JSON.stringify(model.features)).toContain(featureName);
		const spell = model.spells.find(candidate => candidate.id === spellId);
		expect(spell).toBeDefined();
		expect(spell.sources.some(source => source.kind === "subclass" && source.label === name && source.alwaysPrepared)).toBe(true);
	});

	it("declares each patron resistance against a unique source feature", () => {
		const fields = ["name", "source", "page", "className", "classSource", "subclassShortName", "subclassSource", "level"];
		const records = sources.warlock.subclassFeature;
		for (const [id, patron, damageType, level] of [
			["celestial-radiant-soul", "celestial|xphb", "radiant", 6],
			["great-old-one-thought-shield", "great-old-one|xphb", "psychic", 10],
		]) {
			const annotation = context.rules.mechanics.find(entry => entry.id === id);
			expect(annotation.when).toEqual({subclassId: patron, minimumLevel: level});
			expect(annotation.effects).toEqual([{type: "resistance", damageType}]);
			const matches = records.filter(candidate => fields.every(field => annotation.source[field] === undefined || annotation.source[field] === candidate[field]));
			expect(matches).toHaveLength(1);
		}
	});

	it("grants the Celestial radiant resistance from level 6", () => {
		const document = setCharacterChoice(levelFive(), subclassId, ["celestial|xphb"]);
		document.build.level = 6;
		document.build.choices.find(choice => choice.id.endsWith(":prepared-spells")).selected.push("spell:charm-person|xphb");
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "resistance", damageType: "radiant", annotationId: "celestial-radiant-soul"}));
	});
});
