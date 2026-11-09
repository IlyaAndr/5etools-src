import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createFighterDraft, getFighterChoiceDescriptors, getFighterClassChoiceDescriptors} from "../../../js/character-builder/fighter-choices.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const races = readJson("../../../data/races.json");
const catalog = createSpeciesCatalog({races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {
	rules: readJson("../../../js/character-builder/rules/character-sheet.json"),
	sources: {
		abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
		skills: readJson("../../../data/skills.json"),
		fighter: readJson("../../../data/class/class-fighter.json"),
		backgrounds: readJson("../../../data/backgrounds.json"),
	},
};

describe("Fighter class choice contribution", () => {
	it.each([1, 3, 5])("does not depend on species or background at level %i", level => {
		const document = createFighterDraft(catalog.dataset);
		document.build.level = level;
		const expected = getFighterClassChoiceDescriptors(document, context);
		const different = JSON.parse(JSON.stringify(document));
		different.build.species = {name: "Tiefling", source: "XPHB"};
		different.build.background = {name: "Acolyte", source: "XPHB"};
		const noBackgroundData = {...context, sources: {...context.sources, backgrounds: undefined}};
		expect(getFighterClassChoiceDescriptors(different, noBackgroundData)).toEqual(expected);
		expect(expected.every(choice => choice.id.startsWith("class:fighter|xphb:"))).toBe(true);
		expect(expected.find(choice => choice.id.endsWith(":skills")).options).toContainEqual({id: "athletics", label: "Athletics"});
		expect(expected.some(choice => choice.id.endsWith(":equipment"))).toBe(false);
	});

	it("composes the existing Soldier preset and removes duplicate background skills", () => {
		const document = createFighterDraft(catalog.dataset);
		const classSkills = getFighterClassChoiceDescriptors(document, context).find(choice => choice.id.endsWith(":skills"));
		const editorSkills = getFighterChoiceDescriptors(document, catalog, context).find(choice => choice.id.endsWith(":skills"));
		expect(classSkills.options.map(option => option.id)).toEqual(expect.arrayContaining(["athletics", "intimidation"]));
		expect(editorSkills.options.map(option => option.id)).not.toContain("athletics");
		expect(editorSkills.options.map(option => option.id)).not.toContain("intimidation");
	});

	it("retains saved level-specific choices without mutating the document", () => {
		let document = createFighterDraft(catalog.dataset);
		document.build.level = 5;
		document = setCharacterChoice(document, "class:fighter|xphb:subclass", ["champion|xphb"]);
		document.build.level = 1;
		const copy = JSON.parse(JSON.stringify(document));
		const subclass = getFighterClassChoiceDescriptors(document, context).find(choice => choice.id.endsWith(":subclass"));
		expect(subclass).toMatchObject({available: false, selected: ["champion|xphb"]});
		expect(document).toEqual(copy);
	});

	it("does not provide Fighter choices for another class", () => {
		const document = createFighterDraft(catalog.dataset);
		document.build.class = {name: "Warlock", source: "XPHB"};
		expect(getFighterClassChoiceDescriptors(document, context)).toEqual([]);
	});
});
