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
	});

	it("rejects unknown spells and unsupported source shapes", () => {
		const unknown = clone(subclass("Fiend"));
		unknown.record.additionalSpells[0].prepared[3][0] = "not a spell|xphb";
		expect(() => getSubclassSpellGrants(unknown, spellCatalog)).toThrow(/Unknown subclass spell/);

		const malformed = clone(subclass("Archfey"));
		malformed.record.additionalSpells[0].prepared[3] = "misty step|xphb";
		expect(() => getSubclassSpellGrants(malformed, spellCatalog)).toThrow(/Unsupported Archfey prepared spells/);

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
});
