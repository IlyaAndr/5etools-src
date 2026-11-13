import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {renderCharacterSheet} from "../../../js/character-builder/sheet-renderer.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createWarlockDraft} from "../../../js/character-builder/warlock-choices.js";
import {completeWarlock} from "./test-documents.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const races = readJson("../../../data/races.json");
const catalog = createSpeciesCatalog({races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {
	rules: readJson("../../../js/character-builder/rules/character-sheet.json"),
	spells,
	sources: {
		races,
		abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
		skills: readJson("../../../data/skills.json"),
		fighter: readJson("../../../data/class/class-fighter.json"),
		backgrounds: readJson("../../../data/backgrounds.json"),
		warlock: readJson("../../../data/class/class-warlock.json"),
		optionalFeatures: readJson("../../../data/optionalfeatures.json"),
		feats: readJson("../../../data/feats.json"),
		itemMasteries: readJson("../../../data/items-base.json"),
		spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
	},
};
const owner = "class:warlock|xphb";
const patrons = [["archfey|xphb", "Archfey"], ["celestial|xphb", "Celestial"], ["fiend|xphb", "Fiend"], ["great-old-one|xphb", "Great Old One"]];
const levels = [3, 5, 9, 11, 14, 17, 19, 20];

function build (level, patron) {
	let document = createWarlockDraft(catalog.dataset);
	document.build.level = level;
	if (patron) document = setCharacterChoice(document, `${owner}:subclass`, [patron]);
	return completeWarlock(document, catalog, context);
}

function expectCompleteSheet (document) {
	const model = createCharacterSheetModel(document, catalog, context);
	expect(model.issues).toEqual([]);
	expect(model.status).toBe("complete");
	const html = renderCharacterSheet(model, catalog);
	expect(html).toContain("data-sheet-status=\"complete\"");
	expect(html).not.toContain("Complete these choices");
	expect(model.spells.length).toBeGreaterThan(0);
	expect(model.resources.length).toBeGreaterThan(0);
	return model;
}

describe("A whole Warlock build from level 1 to 20", () => {
	it.each([1, 2])("completes a level %i Warlock before its patron arrives", level => {
		const model = expectCompleteSheet(build(level, null));
		expect(model.subclassName).toBeNull();
		expect(model.resources.some(resource => resource.id.endsWith(":contact-patron"))).toBe(false);
	});

	it.each(levels.flatMap(level => patrons.map(([patron, name]) => [level, patron, name])))("completes a level %i %s Warlock at every reviewed level", (level, patron, name) => {
		const model = expectCompleteSheet(build(level, patron));
		expect(model.subclassName).toBe(name);
		// Only the class features the level actually reaches may appear.
		expect(model.resources.some(resource => resource.id.endsWith(":contact-patron"))).toBe(level >= 9);
		const arcana = model.resources.filter(resource => /:arcanum-[6-9]$/.test(resource.id));
		expect(arcana).toHaveLength([11, 13, 15, 17].filter(minimum => level >= minimum).length);
		expect(model.features.some(feature => feature.name === "Epic Boon" || feature.name === "Boon of Combat Prowess")).toBe(level >= 19);
		const cunning = model.resources.find(resource => resource.id.endsWith(":magical-cunning"));
		expect(cunning.note).toBe(level >= 20 ? "Regain all your expended Pact Magic slots." : "Regain expended Pact Magic slots, up to half your maximum (round up).");
	});
});
