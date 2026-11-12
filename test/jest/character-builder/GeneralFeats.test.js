import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {getFeatAbilityChoice} from "../../../js/character-builder/feat-choices.js";
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
const context = {rules: readJson("../../../js/character-builder/rules/character-sheet.json"), spells, sources};
const clone = value => JSON.parse(JSON.stringify(value));
const owner = "class:warlock|xphb";
const featRecord = name => sources.feats.feat.find(record => record.name === name && record.source === "XPHB");
const levelFive = () => clone(createSheetExamples(catalog.dataset).find(example => example.id === "infernal-tiefling-warlock-level-5").document);
const withFeat = (featId, ability) => {
	let document = setCharacterChoice(levelFive(), `${owner}:level-4-feat`, [featId]);
	document = setCharacterChoice(document, `${owner}:level-4-ability-increases`, []);
	if (ability) document = setCharacterChoice(document, `${owner}:level-4-feat-ability`, [ability]);
	return document;
};
const score = (model, ability) => model.abilities.find(entry => entry.id === ability).score;

describe("Reviewed general feats", () => {
	it("reads a fixed or chosen ability increase from the source record", () => {
		expect(getFeatAbilityChoice(featRecord("Durable"))).toEqual({fixed: "con", amount: 1});
		expect(getFeatAbilityChoice(featRecord("Crusher"))).toEqual({options: ["str", "con"], amount: 1});
		expect(getFeatAbilityChoice({name: "Broken", ability: "str"})).toBeNull();
		expect(() => getFeatAbilityChoice({name: "Broken", ability: [{str: 2}]})).toThrow(/Unsupported Broken ability increase/);
	});

	it("offers the reviewed general feats beside Ability Score Improvement", () => {
		const list = getWarlockChoiceDescriptors(levelFive(), catalog, context);
		const feat = list.find(entry => entry.id === `${owner}:level-4-feat`);
		expect(feat.options.map(option => option.id)).toEqual([
			"ability-score-improvement|xphb", "actor|xphb", "athlete|xphb", "charger|xphb", "crossbow-expert|xphb", "crusher|xphb",
			"defensive-duelist|xphb", "dual-wielder|xphb", "durable|xphb", "elemental-adept|xphb", "grappler|xphb", "great-weapon-master|xphb",
			"inspiring-leader|xphb", "mage-slayer|xphb", "mounted-combatant|xphb", "piercer|xphb", "polearm-master|xphb", "sentinel|xphb",
			"sharpshooter|xphb", "slasher|xphb", "speedy|xphb", "spell-sniper|xphb", "war-caster|xphb", "weapon-master|xphb",
		]);
		expect(list.find(entry => entry.id === `${owner}:level-4-ability-increases`).available).toBe(true);
		const crusher = getWarlockChoiceDescriptors(withFeat("crusher|xphb"), catalog, context);
		const ability = crusher.find(entry => entry.id === `${owner}:level-4-feat-ability`);
		expect(ability.options.map(option => option.id)).toEqual(["str", "con"]);
		expect(crusher.find(entry => entry.id === `${owner}:level-4-ability-increases`).available).toBe(false);
	});

	it("enforces a feat's ability prerequisite", () => {
		const model = createCharacterSheetModel(withFeat("great-weapon-master|xphb"), catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({
			id: `${owner}:level-4-feat`,
			message: "Great Weapon Master: the feat's prerequisites are not met.",
		}));
	});

	it("applies a fixed-ability feat that meets its prerequisite", () => {
		const model = createCharacterSheetModel(withFeat("actor|xphb"), catalog, context);
		expect(model.status).toBe("complete");
		expect(score(model, "cha")).toBe(18);
		expect(model.features.some(feature => feature.name === "Actor")).toBe(true);
	});

	it("accepts a spellcasting feat for a spellcasting class", () => {
		const model = createCharacterSheetModel(withFeat("war-caster|xphb", "cha"), catalog, context);
		expect(model.status).toBe("complete");
		expect(score(model, "cha")).toBe(18);
		expect(model.features.some(feature => feature.name === "War Caster")).toBe(true);
	});

	it("applies a chosen-feat ability increase and renders the feat", () => {
		const model = createCharacterSheetModel(withFeat("crusher|xphb", "str"), catalog, context);
		expect(model.status).toBe("complete");
		expect(score(model, "str")).toBe(9);
		expect(model.features.some(feature => feature.name === "Crusher")).toBe(true);
	});

	it("applies a fixed-feat ability increase without a choice", () => {
		const model = createCharacterSheetModel(withFeat("durable|xphb"), catalog, context);
		expect(model.status).toBe("complete");
		expect(score(model, "con")).toBe(14);
		expect(model.features.some(feature => feature.name === "Durable")).toBe(true);
	});
});
