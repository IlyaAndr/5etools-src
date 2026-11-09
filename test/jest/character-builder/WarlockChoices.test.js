import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {validateCharacterDocument} from "../../../js/character-builder/character-document.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setFighterChoice} from "../../../js/character-builder/fighter-choices.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createWarlockDraft, getWarlockChoiceDescriptors, getWarlockSourceChoices, isSupportedWarlockDocument} from "../../../js/character-builder/warlock-choices.js";
import {getBackgroundSourceChoices} from "../../../js/character-builder/source-choices.js";

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
	},
};
const descriptors = document => getWarlockChoiceDescriptors(document, catalog, context);
const choice = (document, suffix) => descriptors(document).find(value => value.id.endsWith(suffix));

describe("Warlock editor choices", () => {
	it("starts an incomplete build with one shared spellcasting ability", () => {
		const draft = createWarlockDraft(catalog.dataset, {getRandomValues: bytes => bytes.fill(2)});
		expect(validateCharacterDocument(draft)).toBe(true);
		expect(isSupportedWarlockDocument(draft)).toBe(true);
		expect(draft.id).toBe(`character-${"02".repeat(16)}`);
		expect(draft.build.choices).toEqual([
			{id: "species:tiefling|xphb:spellcasting-ability", selected: ["cha"]},
			{id: "feat:magic-initiate-cleric|xphb:ability", selected: ["cha"]},
		]);
		expect(choice(draft, ":spellcasting-ability").options.map(value => value.id)).toEqual(["cha"]);
		expect(choice(draft, ":ability").options.map(value => value.id)).toEqual(["cha"]);
		expect(createCharacterSheetModel(draft, catalog, context).status).toBe("incomplete");
	});

	it.each([1, 3, 5])("supports the decisions of the level %i reference build", level => {
		const document = createSheetExamples(catalog.dataset).find(entry => entry.id === `infernal-tiefling-warlock-level-${level}`).document;
		const choices = descriptors(document);
		for (const saved of document.build.choices) {
			const descriptor = choices.find(value => value.id === saved.id);
			expect(descriptor).toBeDefined();
			expect(descriptor.available).toBe(true);
			expect(saved.selected.every(id => descriptor.options.some(option => option.id === id))).toBe(true);
		}
		expect(createCharacterSheetModel(document, catalog, context).status).toBe("complete");
	});

	it("reads class and background choices and progression from the original records", () => {
		const sources = structuredClone(context.sources);
		const warlock = sources.warlock.class.find(record => record.name === "Warlock" && record.source === "XPHB");
		warlock.startingProficiencies.skills[0].choose = {from: ["arcana", "insight", "nature"], count: 1};
		warlock.classTableGroups[0].rows[0][0] = 2;
		const acolyte = sources.backgrounds.background.find(record => record.name === "Acolyte" && record.source === "XPHB");
		acolyte.skillProficiencies = [{insight: true, history: true}];
		for (const entry of acolyte.ability) entry.choose.weighted.from = ["str", "dex", "cha"];
		const sourceChoices = getWarlockSourceChoices(sources);
		expect(sourceChoices.classSkills).toEqual(["arcana", "insight", "nature"]);
		expect(sourceChoices.classSkillCount).toBe(1);
		expect(getBackgroundSourceChoices(sources, {name: "Acolyte", source: "XPHB"}).backgroundSkills).toEqual(["insight", "history"]);
		expect(sourceChoices.progression(1)).toEqual({invocations: 2, cantrips: 2, prepared: 2, slots: 1, slotLevel: 1});
		const draft = createWarlockDraft(catalog.dataset);
		const choices = getWarlockChoiceDescriptors(draft, catalog, {...context, sources});
		expect(choices.find(value => value.id.endsWith(":skills")).options.map(value => value.id)).toEqual(["arcana", "nature"]);
		expect(choices.find(value => value.id.endsWith(":ability-increases")).options.map(value => value.id)).toContain("str-2.cha-1");
		expect(choices.find(value => value.id.endsWith(":invocations")).count).toBe(2);
	});

	it("filters prepared spells by slot level and retains higher-level selections when lowered", () => {
		const draft = createWarlockDraft(catalog.dataset);
		const id = "class:warlock|xphb:prepared-spells";
		const one = choice(draft, ":prepared-spells");
		expect(one.options.map(value => value.id)).not.toContain("spell:misty-step|xphb");
		const three = {...draft, build: {...draft.build, level: 3}};
		expect(choice(three, ":prepared-spells").options.map(value => value.id)).toContain("spell:misty-step|xphb");
		const saved = setFighterChoice(three, id, ["spell:misty-step|xphb"]);
		const lowered = {...saved, build: {...saved.build, level: 1}};
		expect(choice(lowered, ":prepared-spells").selected).toEqual(["spell:misty-step|xphb"]);
		expect(lowered.build.choices.find(value => value.id === id).selected).toEqual(["spell:misty-step|xphb"]);
	});

	it("exposes invocation cantrip choices only when their prerequisite is selected", () => {
		let draft = createWarlockDraft(catalog.dataset);
		draft.build.level = 2;
		const id = "class:warlock|xphb:agonizing-blast-cantrip";
		expect(descriptors(draft).find(value => value.id === id).available).toBe(false);
		draft = setFighterChoice(draft, "class:warlock|xphb:invocations", ["agonizing-blast|xphb"]);
		draft = setFighterChoice(draft, "class:warlock|xphb:cantrips", ["spell:eldritch-blast|xphb", "spell:mind-sliver|xphb"]);
		expect(descriptors(draft).find(value => value.id === id)).toMatchObject({available: true, options: [{id: "spell:eldritch-blast|xphb", label: "Eldritch Blast"}]});
		draft = setFighterChoice(draft, id, ["spell:eldritch-blast|xphb"]);
		draft = setFighterChoice(draft, "class:warlock|xphb:invocations", []);
		expect(descriptors(draft).find(value => value.id === id)).toMatchObject({available: false, selected: ["spell:eldritch-blast|xphb"]});
	});

	it("preserves imported different spellcasting abilities and equivalent increase ordering", () => {
		let draft = createWarlockDraft(catalog.dataset);
		draft = setFighterChoice(draft, "species:tiefling|xphb:spellcasting-ability", ["int"]);
		draft = setFighterChoice(draft, "feat:magic-initiate-cleric|xphb:ability", ["wis"]);
		draft = setFighterChoice(draft, "background:acolyte|xphb:ability-increases", ["wis-1.cha-2"]);
		expect(choice(draft, ":spellcasting-ability").selected).toEqual(["int"]);
		expect(choice(draft, ":ability").selected).toEqual(["wis"]);
		expect(choice(draft, ":spellcasting-ability").options.map(value => value.id)).toEqual(expect.arrayContaining(["cha", "int"]));
		expect(choice(draft, ":ability").options.map(value => value.id)).toEqual(expect.arrayContaining(["cha", "wis"]));
		expect(choice(draft, ":ability-increases").options).toContainEqual({id: "wis-1.cha-2", label: "Charisma +2, Wisdom +1"});
	});

	it("rejects malformed source records instead of silently falling back", () => {
		const sources = structuredClone(context.sources);
		sources.warlock.class.find(record => record.name === "Warlock" && record.source === "XPHB").classTableGroups[0].rows[0][0] = "unknown";
		expect(() => getWarlockSourceChoices(sources)).toThrow(/Warlock progression table/);
		expect(() => getBackgroundSourceChoices({...context.sources, backgrounds: undefined}, {name: "Acolyte", source: "XPHB"})).toThrow(/Acolyte source record/);
	});

	it("loads Warlock and both backgrounds as independent source records", () => {
		const classChoices = getWarlockSourceChoices({...context.sources, backgrounds: undefined});
		const soldier = getBackgroundSourceChoices({...context.sources, warlock: undefined}, {name: "Soldier", source: "XPHB"});
		const acolyte = getBackgroundSourceChoices({...context.sources, warlock: undefined}, {name: "Acolyte", source: "XPHB"});
		expect(classChoices.classSkills).toContain("arcana");
		expect(classChoices.progression(3).slotLevel).toBe(2);
		expect(soldier.backgroundSkills).toEqual(["athletics", "intimidation"]);
		expect(acolyte.backgroundSkills).toEqual(["insight", "religion"]);
		expect(soldier.backgroundAbilityIds).toEqual(["str", "dex", "con"]);
		expect(acolyte.backgroundAbilityIds).toEqual(["int", "wis", "cha"]);
	});

	it("requires an unambiguous, source-qualified background record", () => {
		const sources = structuredClone(context.sources);
		const ref = {name: "Acolyte", source: "XPHB"};
		expect(() => getBackgroundSourceChoices(sources, {...ref, source: "UNKNOWN"})).toThrow(/UNKNOWN Acolyte source record/);
		sources.backgrounds.background.push(structuredClone(sources.backgrounds.background.find(record => record.name === ref.name && record.source === ref.source)));
		expect(() => getBackgroundSourceChoices(sources, ref)).toThrow(/ambiguous XPHB Acolyte source record/);
	});
});
