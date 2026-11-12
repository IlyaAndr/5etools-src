import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpellCatalog} from "../../../js/character-builder/spell-catalog.js";
import {getWarlockChoiceDescriptors} from "../../../js/character-builder/warlock-choices.js";

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
const levelOne = () => clone(createSheetExamples(catalog.dataset).find(example => example.id === "infernal-tiefling-warlock-level-1").document);
const invocationId = "class:warlock|xphb:invocations";
const cantripsId = "class:warlock|xphb:pact-of-the-tome-cantrips";
const ritualsId = "class:warlock|xphb:pact-of-the-tome-rituals";
const descriptors = document => getWarlockChoiceDescriptors(document, catalog, context);
const withTome = () => setCharacterChoice(levelOne(), invocationId, ["pact-of-the-tome|xphb"]);

describe("Pact of the Tome invocation", () => {
	it("offers three cantrips and two rituals only while the invocation is selected", () => {
		const list = descriptors(withTome());
		const cantrips = list.find(entry => entry.id === cantripsId);
		const rituals = list.find(entry => entry.id === ritualsId);
		expect(cantrips).toMatchObject({count: 3, minimumLevel: 1, available: true});
		expect(cantrips.options).toHaveLength(spellCatalog.spells.filter(spell => spell.level === 0).length);
		expect(cantrips.options.every(option => option.spell.level === 0)).toBe(true);
		expect(rituals).toMatchObject({count: 2, minimumLevel: 1, available: true});
		expect(rituals.options.every(option => option.spell.level === 1 && option.spell.ritual)).toBe(true);

		const unselected = descriptors(setCharacterChoice(levelOne(), invocationId, ["eldritch-mind|xphb"]));
		expect(unselected.find(entry => entry.id === cantripsId).available).toBe(false);
		expect(unselected.find(entry => entry.id === ritualsId).available).toBe(false);
	});

	it("builds a complete sheet with the chosen tome spells as invocation spells", () => {
		let document = setCharacterChoice(withTome(), cantripsId, ["spell:minor-illusion|xphb", "spell:prestidigitation|xphb", "spell:mending|xphb"]);
		document = setCharacterChoice(document, ritualsId, ["spell:comprehend-languages|xphb", "spell:detect-magic|xphb"]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		const cantrip = model.spells.find(spell => spell.id === "spell:minor-illusion|xphb");
		expect(cantrip.sources.some(source => source.kind === "invocation" && source.label === "Pact of the Tome" && source.atWill)).toBe(true);
		const ritual = model.spells.find(spell => spell.id === "spell:detect-magic|xphb");
		expect(ritual.sources.some(source => source.kind === "invocation" && source.label === "Pact of the Tome" && source.alwaysPrepared)).toBe(true);
	});

	it("rejects a cantrip count that does not match the choice", () => {
		let document = setCharacterChoice(withTome(), cantripsId, ["spell:minor-illusion|xphb"]);
		document = setCharacterChoice(document, ritualsId, ["spell:comprehend-languages|xphb", "spell:detect-magic|xphb"]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues.some(issue => issue.id === cantripsId)).toBe(true);
	});
});
