import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const sources = {
	skills: readJson("../../../data/skills.json"),
	abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
	races: readJson("../../../data/races.json"),
	fighter: readJson("../../../data/class/class-fighter.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	backgrounds: readJson("../../../data/backgrounds.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
	spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
};
const rules = readJson("../../../js/character-builder/rules/character-sheet.json");
const catalog = createSpeciesCatalog({races: sources.races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {rules, sources, spells};
const example = (name, level) => createSheetExamples(catalog.dataset).find(entry => entry.document.build.class.name === name && entry.document.build.level === level).document;

function replaceSpecies (document, name, choices) {
	document.build.species = {name, source: "XPHB"};
	document.build.choices = [...document.build.choices.filter(choice => !choice.id.startsWith("species:")), ...choices];
	return document;
}

describe("Independent class and species contributions", () => {
	it.each([1, 3, 5])("combines Forest Gnome with Warlock at level %i", level => {
		const document = replaceSpecies(example("Warlock", level), "Gnome", [
			{id: "species:gnome|xphb:lineage", selected: ["forest"]},
			{id: "species:gnome|xphb:spellcasting-ability", selected: ["cha"]},
		]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		for (const id of ["int", "wis", "cha"]) expect(model.abilities.find(ability => ability.id === id).savingThrowAdvantages).not.toHaveLength(0);
		expect(model.resources.find(resource => resource.name === "Speak with Animals")).toMatchObject({maxUses: level >= 5 ? 3 : 2});
		expect(model.resources.find(resource => resource.name === "Pact Magic")).toMatchObject({maxUses: level >= 3 ? 2 : 1, slotLevel: level >= 5 ? 3 : level >= 3 ? 2 : 1});
		expect(model.spells.some(spell => spell.ref.name === "Minor Illusion")).toBe(true);
	});

	it.each([1, 3, 5])("combines Infernal Tiefling with Fighter at level %i", level => {
		const document = replaceSpecies(example("Fighter", level), "Tiefling", [
			{id: "species:tiefling|xphb:legacy", selected: ["infernal"]},
			{id: "species:tiefling|xphb:spellcasting-ability", selected: ["int"]},
			{id: "species:tiefling|xphb:size", selected: ["medium"]},
		]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "resistance", damageType: "fire"}));
		expect(model.resources.find(resource => resource.name === "Second Wind")).toMatchObject({maxUses: level >= 5 ? 3 : 2});
		expect(model.spells.some(spell => spell.ref.name === "Thaumaturgy")).toBe(true);
		expect(model.resources.some(resource => resource.name === "Hellish Rebuke")).toBe(level >= 3);
		expect(model.resources.some(resource => resource.name === "Darkness")).toBe(level >= 5);
	});

	it("uses canonical Warlock and Acolyte data with a different species", () => {
		const document = replaceSpecies(example("Warlock", 5), "Gnome", [
			{id: "species:gnome|xphb:lineage", selected: ["forest"]},
			{id: "species:gnome|xphb:spellcasting-ability", selected: ["cha"]},
		]);
		const modifiedSources = structuredClone(sources);
		modifiedSources.warlock.class.find(entry => entry.name === "Warlock" && entry.source === "XPHB").classTableGroups[0].rows[4][3] = 3;
		modifiedSources.backgrounds.background.find(entry => entry.name === "Acolyte" && entry.source === "XPHB").skillProficiencies = [{insight: true, nature: true}];
		const model = createCharacterSheetModel(document, catalog, {...context, sources: modifiedSources});
		expect(model.status).toBe("complete");
		expect(model.resources.find(resource => resource.name === "Pact Magic").maxUses).toBe(3);
		const skills = model.abilities.flatMap(ability => ability.skills);
		expect(skills.find(skill => skill.id === "nature").proficient).toBe(true);
		expect(skills.find(skill => skill.id === "religion").proficient).toBe(false);
	});

	it("uses canonical Fighter and Soldier data with a different species", () => {
		const document = replaceSpecies(example("Fighter", 5), "Tiefling", [
			{id: "species:tiefling|xphb:legacy", selected: ["infernal"]},
			{id: "species:tiefling|xphb:spellcasting-ability", selected: ["int"]},
			{id: "species:tiefling|xphb:size", selected: ["medium"]},
		]);
		const modifiedSources = structuredClone(sources);
		modifiedSources.fighter.class.find(entry => entry.name === "Fighter" && entry.source === "XPHB").classTableGroups[0].rows[4][0] = "4";
		modifiedSources.backgrounds.background.find(entry => entry.name === "Soldier" && entry.source === "XPHB").skillProficiencies = [{athletics: true, religion: true}];
		const model = createCharacterSheetModel(document, catalog, {...context, sources: modifiedSources});
		expect(model.status).toBe("complete");
		expect(model.resources.find(resource => resource.name === "Second Wind").maxUses).toBe(4);
		const skills = model.abilities.flatMap(ability => ability.skills);
		expect(skills.find(skill => skill.id === "religion").proficient).toBe(true);
		expect(skills.find(skill => skill.id === "intimidation").proficient).toBe(false);
	});

	it("enforces background weighted alternatives independently of the species", () => {
		const document = replaceSpecies(example("Warlock", 1), "Gnome", [
			{id: "species:gnome|xphb:lineage", selected: ["forest"]},
			{id: "species:gnome|xphb:spellcasting-ability", selected: ["cha"]},
		]);
		const modifiedSources = structuredClone(sources);
		const acolyte = modifiedSources.backgrounds.background.find(entry => entry.name === "Acolyte" && entry.source === "XPHB");
		acolyte.ability[0].choose.weighted.from = ["int", "wis"];
		const model = createCharacterSheetModel(document, catalog, {...context, sources: modifiedSources});
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: "background:acolyte|xphb:ability-increases"}));
	});

	it("enforces the Magic Initiate ability source independently of the species", () => {
		const document = replaceSpecies(example("Warlock", 1), "Gnome", [
			{id: "species:gnome|xphb:lineage", selected: ["forest"]},
			{id: "species:gnome|xphb:spellcasting-ability", selected: ["cha"]},
		]);
		const modifiedSources = structuredClone(sources);
		const feat = modifiedSources.feats.feat.find(entry => entry.name === "Magic Initiate" && entry.source === "XPHB");
		feat.additionalSpells.find(group => group.name === "Cleric Spells").ability.choose = ["int", "wis"];
		const model = createCharacterSheetModel(document, catalog, {...context, sources: modifiedSources});
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: "feat:magic-initiate-cleric|xphb:ability"}));
	});

	it.each([["Fighter", "warlock"], ["Warlock", "fighter"]])("calculates %s without the unrelated %s class dataset", (name, unrelated) => {
		const model = createCharacterSheetModel(example(name, 5), catalog, {...context, sources: {...sources, [unrelated]: undefined}});
		expect(model.status).toBe("complete");
		expect(model.className).toBe(name);
	});

	it("combines class and background equipment independently", () => {
		const document = example("Fighter", 1);
		document.build.background = {name: "Acolyte", source: "XPHB"};
		document.build.choices = document.build.choices.filter(choice => !choice.id.startsWith("background:soldier|xphb:"));
		document.build.choices.push(
			{id: "background:acolyte|xphb:ability-increases", selected: ["wis-2.cha-1"]},
			{id: "feat:magic-initiate-cleric|xphb:ability", selected: ["int"]},
			{id: "feat:magic-initiate-cleric|xphb:cantrips", selected: ["spell:guidance|xphb", "spell:light|xphb"]},
			{id: "feat:magic-initiate-cleric|xphb:spell", selected: ["spell:healing-word|xphb"]},
		);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.gear).toEqual(expect.arrayContaining(["Chain Mail (75 GP)", "Calligrapher's Supplies (10 GP)", "Holy Symbol: Amulet (5 GP)", "Book: Occult Lore (25 GP)", "Robe (1 GP)"]));
		expect(model.gear).not.toContain("Dice Set (1 SP)");
	});

	it("keeps an unsupported background incomplete instead of inventing equipment", () => {
		const document = example("Fighter", 1);
		document.build.background = {name: "Haunted One", source: "VRGTR"};
		document.build.choices = document.build.choices.filter(choice => !choice.id.startsWith("background:"));
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toEqual(expect.arrayContaining([expect.objectContaining({id: "background"})]));
		expect(model.abilities).toHaveLength(0);
	});
});
