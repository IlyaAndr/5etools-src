import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {projectSpecies} from "../../../js/character-builder/species-projection.js";
import {getSpeciesChoiceDescriptors} from "../../../js/character-builder/species-choices.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
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

describe("Elven lineages and the Keen Senses skill", () => {
	const elf = (lineage, cantrip) => {
		const document = speciesCharacter("Elf");
		document.build.choices.push(
			{id: "species:elf|xphb:lineage", selected: [lineage]},
			{id: "species:elf|xphb:spellcasting-ability", selected: ["cha"]},
			{id: "species:elf|xphb:skill", selected: ["perception"]},
		);
		if (cantrip) document.build.choices.push({id: "species:elf|xphb:high-elf:cantrip", selected: [cantrip]});
		return document;
	};

	it.each([
		["drow", ["Dancing Lights", "Darkness", "Faerie Fire"]],
		["wood-elf", ["Druidcraft", "Longstrider", "Pass without Trace"]],
	])("projects the %s lineage's spells", (lineage, names) => {
		const projection = projectSpecies(elf(lineage), catalog);
		expect(projection.spells.map(spell => spell.ref.name).sort()).toEqual(names);
		expect(projection.unresolvedChoices).toEqual([]);
	});

	it("offers the High Elf cantrip from the reviewed Wizard list", () => {
		const document = elf("high-elf");
		const descriptors = getSpeciesChoiceDescriptors(document, catalog, {sources});
		const cantrip = descriptors.find(descriptor => descriptor.id === "species:elf|xphb:high-elf:cantrip");
		expect(cantrip.options).toHaveLength(20);
		expect(cantrip.options.map(option => option.id)).toEqual(expect.arrayContaining(["spell:fire-bolt|xphb", "spell:minor-illusion|xphb"]));
		expect(descriptors.find(descriptor => descriptor.id === "species:elf|xphb:skill").options.map(option => option.id)).toEqual(["insight", "perception", "survival"]);
		expect(projectSpecies(document, catalog).unresolvedChoices).toEqual([expect.objectContaining({id: "species:elf|xphb:high-elf:cantrip"})]);
	});

	it("adds the chosen High Elf cantrip, the lineage spells, and the skill", () => {
		const model = createCharacterSheetModel(elf("high-elf", "spell:fire-bolt|xphb"), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		expect(model.spells.map(spell => spell.ref.name)).toEqual(expect.arrayContaining(["Fire Bolt", "Detect Magic", "Misty Step"]));
		expect(model.abilities.flatMap(ability => ability.skills).find(skill => skill.id === "perception").proficient).toBe(true);
		expect(model.spellcasting.find(profile => profile.label === "Species").ability).toBe("cha");
	});

	it("rejects a species skill that repeats a background or class proficiency", () => {
		// Insight is both a Keen Senses option and the Acolyte's own proficiency.
		const swapped = setCharacterChoice(elf("drow"), "species:elf|xphb:skill", ["insight"]);
		const model = createCharacterSheetModel(swapped, catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: "species:elf|xphb:skill"}));
	});
});

describe("Human's Skillful and Versatile", () => {
	const human = ({feat, skill = "animal-handling", proficiencies} = {}) => {
		const document = speciesCharacter("Human");
		document.build.choices.push(
			{id: "species:human|xphb:size", selected: ["medium"]},
			{id: "species:human|xphb:skill", selected: [skill]},
		);
		if (feat) document.build.choices.push({id: "species:human|xphb:feat", selected: [feat]});
		if (proficiencies) document.build.choices.push({id: "species:human|xphb:feat-proficiency", selected: proficiencies});
		return document;
	};

	it("offers any skill and the reviewed Origin feats, naming the withheld ones", () => {
		const document = human();
		const descriptors = getSpeciesChoiceDescriptors(document, catalog, {sources, rules});
		const skill = descriptors.find(descriptor => descriptor.id === "species:human|xphb:skill");
		expect(skill.options).toHaveLength(18);
		const feat = descriptors.find(descriptor => descriptor.id === "species:human|xphb:feat");
		expect(feat.options).toHaveLength(9);
		expect(feat.options.map(option => option.id)).toEqual(expect.arrayContaining(["alert|xphb", "skilled|xphb", "tough|xphb"]));
		expect(feat.options.map(option => option.id)).not.toContain("magic-initiate-cleric|xphb");
		expect(feat.help).toContain("Magic Initiate");
		expect(projectSpecies(document, catalog).unresolvedChoices.map(choice => choice.id)).toEqual(["species:human|xphb:feat"]);
	});

	it("applies the chosen Origin feat's proficiency choice and renders the feat", () => {
		const document = human({feat: "skilled|xphb", proficiencies: ["tool:smiths-tools|xphb", "tool:lute|xphb", "tool:dice-set|xphb"]});
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		expect(model.training).toEqual(expect.arrayContaining(["Smith's Tools", "Lute", "Dice Set"]));
		expect(model.features.map(feature => feature.name)).toEqual(expect.arrayContaining(["Skilled", "Skillful", "Versatile"]));
		expect(model.abilities.flatMap(ability => ability.skills).find(skill => skill.id === "animal-handling").proficient).toBe(true);
	});

	it("renders a choice-free Origin feat from the species slot", () => {
		const model = createCharacterSheetModel(human({feat: "tough|xphb"}), catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.features.some(feature => feature.name === "Tough")).toBe(true);
	});

	it("rejects a species feat proficiency that repeats an existing skill", () => {
		const document = human({feat: "skilled|xphb", proficiencies: ["skill:animal-handling", "tool:lute|xphb", "tool:dice-set|xphb"]});
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: "species:human|xphb:feat-proficiency"}));
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
