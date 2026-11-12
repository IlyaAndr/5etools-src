import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {projectSpecies} from "../../../js/character-builder/species-projection.js";
import {getSpeciesChoiceDescriptors} from "../../../js/character-builder/species-choices.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const races = readJson("../../../data/races.json");
const sources = {
	skills: readJson("../../../data/skills.json"),
	abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
	races,
	fighter: readJson("../../../data/class/class-fighter.json"),
	backgrounds: readJson("../../../data/backgrounds.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
	spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
};
const rules = readJson("../../../js/character-builder/rules/character-sheet.json");
const catalog = createSpeciesCatalog({races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {rules, spells, sources};
const clone = value => JSON.parse(JSON.stringify(value));

/** Swap the reference Warlock's species, dropping the previous species choices. */
function speciesCharacter (name) {
	const document = clone(createSheetExamples(catalog.dataset).find(example => example.id === "infernal-tiefling-warlock-level-5").document);
	document.build.species = {name, source: "XPHB"};
	document.build.choices = document.build.choices.filter(choice => !choice.id.startsWith("species:"));
	return document;
}

const lineageCharacter = (name, lineage) => {
	const document = speciesCharacter(name);
	document.build.choices.push({id: `species:${name.toLowerCase()}|xphb:lineage`, selected: [lineage]});
	return document;
};

describe("Lineage-free 2024 species", () => {
	it.each([
		["Dwarf", {darkvision: 120, resistances: ["poison"], hpPerLevel: 1, size: "medium"}],
		["Halfling", {darkvision: 0, resistances: [], hpPerLevel: 0, size: "small"}],
		["Orc", {darkvision: 120, resistances: [], hpPerLevel: 0, size: "medium"}],
	])("projects %s without a lineage or species spellcasting", (name, expected) => {
		const projection = projectSpecies(speciesCharacter(name), catalog);
		expect(projection).toMatchObject(expected);
		expect(projection.spells).toEqual([]);
		expect(projection.resources).toEqual([]);
		expect(projection.spellcastingAbility).toBeNull();
		expect(projection.unresolvedChoices).toEqual([]);
	});

	it("offers no species choice for a lineage-free species", () => {
		expect(getSpeciesChoiceDescriptors(speciesCharacter("Dwarf"), catalog, {sources})).toEqual([]);
	});

	it("adds the Dwarven Toughness hit points and poison resistance to the sheet", () => {
		const model = createCharacterSheetModel(speciesCharacter("Dwarf"), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		// Warlock d8, Constitution +2, five levels: 11 + 4 × 8 = 43 with Dwarven
		// Toughness (+1 per level), five more than the same build without it.
		expect(model.hp.maximum).toBe(43);
		expect(createCharacterSheetModel(speciesCharacter("Orc"), catalog, context).hp.maximum).toBe(38);
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "resistance", damageType: "poison"}));
		expect(model.features.map(feature => feature.name)).toEqual(expect.arrayContaining(["Dwarven Resilience", "Dwarven Toughness"]));
		expect(model.spellcasting.every(profile => profile.label !== "Species")).toBe(true);
	});

	it("keeps the Halfling Small and without darkvision", () => {
		const model = createCharacterSheetModel(speciesCharacter("Halfling"), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.size).toBe("small");
		expect(model.darkvision).toBe(0);
	});
});

describe("Species-wide cantrips with a fixed ability", () => {
	const aasimar = () => {
		const document = speciesCharacter("Aasimar");
		document.build.choices.push({id: "species:aasimar|xphb:size", selected: ["medium"]});
		return document;
	};

	it("projects the Aasimar's resistances and its Charisma cantrip", () => {
		const projection = projectSpecies(aasimar(), catalog);
		expect(projection.resistances).toEqual(["necrotic", "radiant"]);
		expect(projection.spellcastingAbility).toBe("cha");
		expect(projection.spells).toEqual([expect.objectContaining({id: "spell:light|xphb", ability: "cha", minimumCharacterLevel: 1})]);
		expect(projection.unresolvedChoices).toEqual([]);
	});

	it("offers only the size choice", () => {
		const descriptors = getSpeciesChoiceDescriptors(aasimar(), catalog, {sources});
		expect(descriptors.map(descriptor => descriptor.id)).toEqual(["species:aasimar|xphb:size"]);
	});

	it("adds Light and both resistances to the sheet", () => {
		const model = createCharacterSheetModel(aasimar(), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		expect(model.spells.some(spell => spell.id === "spell:light|xphb")).toBe(true);
		expect(model.defenses.filter(defense => defense.type === "resistance").map(defense => defense.damageType).sort()).toEqual(["necrotic", "radiant"]);
		expect(model.darkvision).toBe(60);
		expect(model.spellcasting.find(profile => profile.label === "Species").ability).toBe("cha");
	});
});

describe("Ancestry choices without species spells", () => {
	it.each([
		["acid", "acid"], ["cold", "cold"], ["fire", "fire"], ["lightning", "lightning"], ["poison", "poison"],
	])("gives the Dragonborn its %s ancestry resistance", (lineage, damageType) => {
		const projection = projectSpecies(lineageCharacter("Dragonborn", lineage), catalog);
		expect(projection.resistances).toEqual([damageType]);
		expect(projection.spells).toEqual([]);
		expect(projection.spellcastingAbility).toBeNull();
		expect(projection.unresolvedChoices).toEqual([]);
	});

	it("records the Dragonborn ancestry on the sheet with its resistance", () => {
		const model = createCharacterSheetModel(lineageCharacter("Dragonborn", "fire"), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "resistance", damageType: "fire"}));
		expect(model.features.find(feature => feature.name === "Draconic Ancestry").selection).toEqual({label: "Selected lineage", value: "Fire"});
		expect(model.darkvision).toBe(60);
	});

	it("offers the six Giant Ancestries and records the chosen one", () => {
		const document = lineageCharacter("Goliath", "storms-thunder");
		const descriptor = getSpeciesChoiceDescriptors(document, catalog, {sources}).find(entry => entry.id === "species:goliath|xphb:lineage");
		expect(descriptor.label).toBe("Giant Ancestry");
		expect(descriptor.options.map(option => option.label)).toEqual([
			"Cloud's Jaunt", "Fire's Burn", "Frost's Chill", "Hill's Tumble", "Stone's Endurance", "Storm's Thunder",
		]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.speed).toBe(35);
		expect(model.defenses.filter(defense => defense.type === "resistance")).toEqual([]);
		expect(model.features.find(feature => feature.name === "Giant Ancestry").selection).toEqual({label: "Selected lineage", value: "Storm's Thunder"});
	});
});
