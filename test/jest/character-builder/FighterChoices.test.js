import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {validateCharacterDocument} from "../../../js/character-builder/character-document.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createFighterDraft, getFighterChoiceDescriptors, getFighterSourceChoices, isSupportedFighterDocument, setFighterChoice} from "../../../js/character-builder/fighter-choices.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";

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
const descriptors = document => getFighterChoiceDescriptors(document, catalog, context);

describe("Fighter editor choices", () => {
	it("starts with a valid, incomplete document rather than preset decisions", () => {
		const draft = createFighterDraft(catalog.dataset);
		expect(validateCharacterDocument(draft)).toBe(true);
		expect(draft.build.choices).toEqual([]);
		expect(draft.build.abilities.scores).toBeNull();
		expect(createCharacterSheetModel(draft, catalog, context).status).toBe("incomplete");
		expect(isSupportedFighterDocument(draft)).toBe(true);
	});

	it("creates independent IDs and keeps each ID through edits", () => {
		const first = createFighterDraft(catalog.dataset, {getRandomValues: bytes => bytes.fill(1)});
		const second = createFighterDraft(catalog.dataset, {getRandomValues: bytes => bytes.fill(2)});
		expect(first.id).not.toBe(second.id);
		expect(first.id).toBe(`character-${"01".repeat(16)}`);
		const edited = setFighterChoice(first, "species:gnome|xphb:lineage", ["forest"]);
		expect(edited.id).toBe(first.id);
		expect(validateCharacterDocument(edited)).toBe(true);
	});

	it("reads available skills and counts from the original source data", () => {
		const draft = createFighterDraft(catalog.dataset);
		const skillChoice = descriptors(draft).find(choice => choice.id.endsWith(":skills"));
		expect(skillChoice.count).toBe(2);
		expect(skillChoice.options).toContainEqual({id: "animal-handling", label: "Animal Handling"});
		expect(skillChoice.options.map(option => option.id)).not.toContain("athletics");
		expect(descriptors(draft).find(choice => choice.id.endsWith(":weapon-masteries")).count).toBe(3);
		const higher = {...draft, build: {...draft.build, level: 4}};
		expect(descriptors(higher).find(choice => choice.id.endsWith(":weapon-masteries")).count).toBe(4);
	});

	it("creates a complete sheet from explicit reviewed decisions", () => {
		let draft = createFighterDraft(catalog.dataset);
		draft.build.abilities.scores = {str: 15, dex: 13, con: 14, int: 12, wis: 10, cha: 8};
		const answers = {
			"species:gnome|xphb:lineage": ["forest"],
			"species:gnome|xphb:spellcasting-ability": ["int"],
			"background:soldier|xphb:ability-increases": ["str-2.con-1"],
			"background:soldier|xphb:tool": ["dice-set|xphb"],
			"character:languages": ["common", "gnomish", "dwarvish"],
			"class:fighter|xphb:skills": ["perception", "survival"],
			"class:fighter|xphb:equipment": ["soldier-sword-and-shield"],
			"class:fighter|xphb:fighting-style": ["defense|xphb"],
			"class:fighter|xphb:weapon-masteries": ["longsword|xphb", "javelin|xphb", "handaxe|xphb"],
		};
		for (const [id, selected] of Object.entries(answers)) {
			const choice = descriptors(draft).find(value => value.id === id);
			expect(selected.every(value => choice.options.some(option => option.id === value))).toBe(true);
			draft = setFighterChoice(draft, id, selected);
		}
		expect(createCharacterSheetModel(draft, catalog, context).issues).toEqual([]);
		expect(createCharacterSheetModel(draft, catalog, context).status).toBe("complete");
	});

	it("allows the reviewed Dagger mastery and resolves its source feature", () => {
		const draft = createFighterDraft(catalog.dataset);
		const choice = descriptors(draft).find(value => value.id === "class:fighter|xphb:weapon-masteries");
		expect(choice.options).toContainEqual({id: "dagger|xphb", label: "Dagger (Nick)"});
		const existing = createSheetExamples(catalog.dataset).find(value => value.id === "forest-gnome-fighter-level-1").document;
		const selected = setFighterChoice(existing, choice.id, ["longsword|xphb", "javelin|xphb", "dagger|xphb"]);
		const model = createCharacterSheetModel(selected, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.features.some(feature => feature.name === "Nick" && feature.sourceRef.source === "XPHB")).toBe(true);
	});

	it("uses changed source skills and counts in both the editor and sheet validation", () => {
		const document = createFighterDraft(catalog.dataset);
		const changedRules = JSON.parse(JSON.stringify(context.rules));
		changedRules.classes["fighter|xphb"].skillOptions = ["perception"];
		const fighter = JSON.parse(JSON.stringify(context.sources.fighter));
		const fighterSource = fighter.class.find(value => value.name === "Fighter" && value.source === "XPHB");
		fighterSource.startingProficiencies.skills[0].choose = {from: ["survival", "history", "insight"], count: 1};
		fighterSource.itemMasteriesProgression[1] = 2;
		const changedContext = {...context, rules: changedRules, sources: {...context.sources, fighter}};
		const choice = getFighterChoiceDescriptors(document, catalog, changedContext).find(value => value.id === "class:fighter|xphb:skills");
		expect(choice.count).toBe(1);
		expect(choice.options.map(value => value.id)).toEqual(["survival", "history", "insight"]);
		expect(getFighterChoiceDescriptors(document, catalog, changedContext).find(value => value.id.endsWith(":weapon-masteries")).count).toBe(2);
		const selected = setFighterChoice(document, choice.id, ["perception"]);
		const model = createCharacterSheetModel(selected, catalog, changedContext);
		expect(model.issues.some(issue => issue.id === choice.id)).toBe(true);
	});

	it("derives background increases and fixed proficiencies from the source", () => {
		const document = createFighterDraft(catalog.dataset);
		const backgrounds = JSON.parse(JSON.stringify(context.sources.backgrounds));
		const soldier = backgrounds.background.find(value => value.name === "Soldier" && value.source === "XPHB");
		for (const entry of soldier.ability) entry.choose.weighted.from = ["str", "dex", "wis"];
		soldier.skillProficiencies = [{history: true, athletics: true}];
		const changedRules = JSON.parse(JSON.stringify(context.rules));
		changedRules.backgrounds["soldier|xphb"].abilities = ["cha"];
		changedRules.backgrounds["soldier|xphb"].skills = ["survival"];
		const changedContext = {...context, rules: changedRules, sources: {...context.sources, backgrounds}};
		const choices = getFighterChoiceDescriptors(document, catalog, changedContext);
		const increases = choices.find(choice => choice.id.endsWith(":ability-increases"));
		expect(increases.options.map(value => value.id)).toContain("str-2.wis-1");
		expect(increases.options.map(value => value.id)).not.toContain("str-2.con-1");
		const skills = choices.find(choice => choice.id.endsWith(":skills"));
		expect(skills.options.map(value => value.id)).not.toContain("history");
		expect(skills.options.map(value => value.id)).toContain("intimidation");
		const selected = setFighterChoice(document, increases.id, ["str-2.con-1"]);
		const model = createCharacterSheetModel(selected, catalog, changedContext);
		expect(model.issues.some(issue => issue.id === increases.id)).toBe(true);
	});

	it("rejects missing or unsupported source records rather than falling back to annotations", () => {
		const draft = createFighterDraft(catalog.dataset);
		expect(() => getFighterChoiceDescriptors(draft, catalog, {...context, sources: {...context.sources, backgrounds: undefined}})).toThrow(/Soldier source/);
		const backgrounds = JSON.parse(JSON.stringify(context.sources.backgrounds));
		backgrounds.background.find(value => value.name === "Soldier" && value.source === "XPHB").skillProficiencies = [{choose: {from: ["history"]}}];
		expect(() => getFighterChoiceDescriptors(draft, catalog, {...context, sources: {...context.sources, backgrounds}})).toThrow(/Soldier skill proficiency/);
	});

	it("reads Second Wind uses by level from the Fighter table", () => {
		const fighter = JSON.parse(JSON.stringify(context.sources.fighter));
		const fighterSource = fighter.class.find(value => value.name === "Fighter" && value.source === "XPHB");
		const table = fighterSource.classTableGroups.find(group => group.colLabels.includes("Second Wind"));
		const column = table.colLabels.indexOf("Second Wind");
		table.rows[0][column] = "7";
		const choices = getFighterSourceChoices({...context.sources, fighter});
		expect(choices.secondWind(1)).toBe(7);
		expect(choices.secondWind(5)).toBe(Number(table.rows[4][column]));
		expect(() => choices.secondWind(0)).toThrow(/Second Wind/);
	});

	it("rejects missing, ambiguous, or malformed Second Wind tables", () => {
		for (const mutate of [
			fighter => { delete fighter.classTableGroups; },
			fighter => { fighter.classTableGroups[0].colLabels[0] = "Unknown"; },
			fighter => { fighter.classTableGroups.push(JSON.parse(JSON.stringify(fighter.classTableGroups[0]))); },
			fighter => { fighter.classTableGroups[0].rows[0][0] = "unknown"; },
			fighter => { fighter.classTableGroups[0].rows.pop(); },
		]) {
			const fighter = JSON.parse(JSON.stringify(context.sources.fighter));
			mutate(fighter.class.find(value => value.name === "Fighter" && value.source === "XPHB"));
			expect(() => getFighterSourceChoices({...context.sources, fighter})).toThrow(/Second Wind table/);
		}
	});

	it("exposes equivalent saved increases without changing their identifier", () => {
		const original = createFighterDraft(catalog.dataset);
		const id = "background:soldier|xphb:ability-increases";
		const saved = setFighterChoice(original, id, ["con-1.str-2"]);
		const choice = descriptors(saved).find(value => value.id === id);
		expect(choice.selected).toEqual(["con-1.str-2"]);
		expect(choice.options).toContainEqual({id: "con-1.str-2", label: "Strength +2, Constitution +1"});
		expect(saved.build.choices).toEqual([{id, selected: ["con-1.str-2"]}]);
	});

	it("retains session data and out-of-level selections until explicitly removed", () => {
		const original = createFighterDraft(catalog.dataset);
		original.session.notes = "Player notes";
		original.session.resources = [{id: "test:resource", spent: 1}];
		original.build.level = 4;
		const id = "class:fighter|xphb:level-4-feat";
		const higher = setFighterChoice(original, id, ["ability-score-improvement|xphb"]);
		const lower = {...higher, build: {...higher.build, level: 1}};
		const choice = descriptors(lower).find(value => value.id === id);
		expect(choice.available).toBe(false);
		expect(choice.selected).toEqual(["ability-score-improvement|xphb"]);
		const cleared = setFighterChoice(lower, id, []);
		expect(cleared.session).toEqual(original.session);
		expect(higher.build.choices).toContainEqual({id, selected: ["ability-score-improvement|xphb"]});
		expect(original.build.choices).toEqual([]);
		expect(cleared.build.choices).toEqual([]);
	});
});
