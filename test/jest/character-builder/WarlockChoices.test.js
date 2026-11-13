import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {validateCharacterDocument} from "../../../js/character-builder/character-document.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {pruneDependentChoices, setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createWarlockDraft, getWarlockChoiceDescriptors, getWarlockSourceChoices, isSupportedWarlockDocument} from "../../../js/character-builder/warlock-choices.js";
import {getBackgroundSourceChoices} from "../../../js/character-builder/source-choices.js";
import {addFeatChoices} from "./test-documents.js";

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
		const saved = setCharacterChoice(three, id, ["spell:misty-step|xphb"]);
		const lowered = {...saved, build: {...saved.build, level: 1}};
		expect(choice(lowered, ":prepared-spells").selected).toEqual(["spell:misty-step|xphb"]);
		expect(lowered.build.choices.find(value => value.id === id).selected).toEqual(["spell:misty-step|xphb"]);
	});

	it("exposes invocation cantrip choices only when their prerequisite is selected", () => {
		let draft = createWarlockDraft(catalog.dataset);
		draft.build.level = 2;
		const id = "class:warlock|xphb:agonizing-blast-cantrip";
		expect(descriptors(draft).find(value => value.id === id).available).toBe(false);
		draft = setCharacterChoice(draft, "class:warlock|xphb:invocations", ["agonizing-blast|xphb"]);
		draft = setCharacterChoice(draft, "class:warlock|xphb:cantrips", ["spell:eldritch-blast|xphb", "spell:mind-sliver|xphb"]);
		expect(descriptors(draft).find(value => value.id === id)).toMatchObject({available: true, options: [{id: "spell:eldritch-blast|xphb", label: "Eldritch Blast"}]});
		draft = setCharacterChoice(draft, id, ["spell:eldritch-blast|xphb"]);
		draft = setCharacterChoice(draft, "class:warlock|xphb:invocations", []);
		expect(descriptors(draft).find(value => value.id === id)).toMatchObject({available: false, selected: ["spell:eldritch-blast|xphb"]});
	});

	it("offers every reviewed invocation and gates it by level and prerequisites", () => {
		expect(Object.keys(context.rules.invocations)).toHaveLength(28);
		const draft = createWarlockDraft(catalog.dataset);
		const options = (level, selected = []) => {
			const document = {
				...draft,
				build: {...draft.build, level, choices: [...draft.build.choices, ...(selected.length ? [{id: "class:warlock|xphb:invocations", selected}] : [])]},
			};
			return descriptors(document).find(value => value.id === "class:warlock|xphb:invocations").options.map(option => option.id);
		};
		expect(options(1)).toEqual(["armor-of-shadows|xphb", "eldritch-mind|xphb", "pact-of-the-blade|xphb", "pact-of-the-chain|xphb", "pact-of-the-tome|xphb"]);
		expect(options(2)).toEqual(expect.arrayContaining([
			"agonizing-blast|xphb", "devils-sight|xphb", "eldritch-spear|xphb", "fiendish-vigor|xphb",
			"mask-of-many-faces|xphb", "misty-visions|xphb", "otherworldly-leap|xphb", "repelling-blast|xphb",
		]));
		expect(options(4)).not.toContain("ascendant-step|xphb");
		expect(options(5)).toEqual(expect.arrayContaining(["ascendant-step|xphb", "gaze-of-two-minds|xphb", "gift-of-the-depths|xphb", "master-of-myriad-forms|xphb", "one-with-shadows|xphb"]));
		expect(options(7)).toContain("whispers-of-the-grave|xphb");
		expect(options(9)).toContain("visions-of-distant-realms|xphb");
		expect(options(14)).not.toContain("witch-sight|xphb");
		expect(options(15)).toContain("witch-sight|xphb");
	});

	it("requires the annotated prerequisite invocation before offering a dependent one", () => {
		const draft = createWarlockDraft(catalog.dataset);
		const options = (level, selected) => {
			const document = {...draft, build: {...draft.build, level, choices: [{id: "class:warlock|xphb:invocations", selected}]}};
			return descriptors(document).find(value => value.id === "class:warlock|xphb:invocations").options.map(option => option.id);
		};
		expect(options(5, [])).not.toContain("thirsting-blade|xphb");
		expect(options(5, ["pact-of-the-blade|xphb"])).toEqual(expect.arrayContaining(["thirsting-blade|xphb", "eldritch-smite|xphb"]));
		expect(options(5, ["pact-of-the-chain|xphb"])).toContain("investment-of-the-chain-master|xphb");
		expect(options(5, ["pact-of-the-chain|xphb"])).not.toContain("thirsting-blade|xphb");
		expect(options(11, ["pact-of-the-blade|xphb"])).not.toContain("devouring-blade|xphb");
		expect(options(12, ["pact-of-the-blade|xphb", "thirsting-blade|xphb"])).toContain("devouring-blade|xphb");
		expect(options(12, ["pact-of-the-blade|xphb"])).not.toContain("devouring-blade|xphb");
	});

	it("offers the Pact Weapon choice only while Pact of the Blade is selected", () => {
		const draft = createWarlockDraft(catalog.dataset);
		expect(choice(draft, ":pact-weapon")).toMatchObject({available: false, count: 1, label: "Pact Weapon"});
		const withBlade = setCharacterChoice(draft, "class:warlock|xphb:invocations", ["pact-of-the-blade|xphb"]);
		const pactWeapon = choice(withBlade, ":pact-weapon");
		expect(pactWeapon).toMatchObject({
			available: true,
			count: 1,
			label: "Pact Weapon",
			dependsOn: {choice: "class:warlock|xphb:invocations", option: "pact-of-the-blade|xphb"},
		});
		expect(pactWeapon.options).toHaveLength(28);
		expect(pactWeapon.options.map(option => option.id)).toEqual(expect.arrayContaining(["longsword|xphb", "greatsword|xphb", "rapier|xphb", "dagger|xphb", "whip|xphb"]));
		expect(pactWeapon.options).toContainEqual({id: "longsword|xphb", label: "Longsword"});
		expect(pactWeapon.options).toContainEqual({id: "dagger|xphb", label: "Dagger"});
	});

	it("drops the saved Pact Weapon when Pact of the Blade is deselected", () => {
		const source = createSheetExamples(catalog.dataset).find(entry => entry.id === "infernal-tiefling-warlock-level-5").document;
		const withBlade = JSON.parse(JSON.stringify(source));
		const invocations = withBlade.build.choices.find(value => value.id === "class:warlock|xphb:invocations");
		invocations.selected = invocations.selected.map(id => id === "armor-of-shadows|xphb" ? "pact-of-the-blade|xphb" : id);
		withBlade.build.choices.push({id: "class:warlock|xphb:pact-weapon", selected: ["longsword|xphb"]});
		expect(createCharacterSheetModel(withBlade, catalog, context).attacks[0]).toMatchObject({name: "Longsword", mastery: null});
		const withoutBlade = setCharacterChoice(withBlade, "class:warlock|xphb:invocations", invocations.selected.map(id => id === "pact-of-the-blade|xphb" ? "armor-of-shadows|xphb" : id));
		const pruned = pruneDependentChoices(withBlade, withoutBlade, descriptors(withoutBlade));
		expect(pruned.build.choices.some(value => value.id === "class:warlock|xphb:pact-weapon")).toBe(false);
		expect(choice(pruned, ":pact-weapon")).toMatchObject({available: false, selected: []});
		const model = createCharacterSheetModel(pruned, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.attacks.map(attack => attack.name)).not.toContain("Longsword");
	});

	it("offers Lessons of the First Ones with every reviewed Origin feat", () => {
		const draft = createWarlockDraft(catalog.dataset);
		const firstLevel = choice(draft, "class:warlock|xphb:invocations");
		expect(firstLevel.options.map(option => option.id)).not.toContain("lessons-of-the-first-ones|xphb");
		expect(firstLevel.help).toBeUndefined();
		const secondLevel = {...draft, build: {...draft.build, level: 2}};
		expect(choice(secondLevel, "class:warlock|xphb:invocations").options.map(option => option.id)).toContain("lessons-of-the-first-ones|xphb");
		const selected = setCharacterChoice(secondLevel, "class:warlock|xphb:invocations", ["lessons-of-the-first-ones|xphb"]);
		const featChoiceId = "class:warlock|xphb:lessons-of-the-first-ones|xphb:feat";
		const featChoice = getWarlockChoiceDescriptors(selected, catalog, context).find(entry => entry.id === featChoiceId);
		expect(featChoice.options).toHaveLength(12);
		expect(featChoice.help).toBeUndefined();
		const model = createCharacterSheetModel(selected, catalog, context);
		expect(model.issues).toContainEqual(expect.objectContaining({id: featChoiceId}));
		const chosen = setCharacterChoice(selected, featChoiceId, ["skilled|xphb"]);
		const proficiencyId = "class:warlock|xphb:lessons-of-the-first-ones|xphb:feat-proficiency";
		const proficiency = getWarlockChoiceDescriptors(chosen, catalog, context).find(entry => entry.id === proficiencyId);
		expect(proficiency.count).toBe(3);
		const complete = createCharacterSheetModel(setCharacterChoice(chosen, proficiencyId, ["tool:lute|xphb", "tool:dice-set|xphb", "tool:smiths-tools|xphb"]), catalog, context);
		expect(complete.issues.filter(issue => issue.id.startsWith("class:warlock|xphb:lessons"))).toEqual([]);
	});

	it("carries Magic Initiate's spell choices through the Lessons feat slot", () => {
		const example = createSheetExamples(catalog.dataset).find(entry => entry.id === "infernal-tiefling-warlock-level-3").document;
		const owner = "class:warlock|xphb:lessons-of-the-first-ones|xphb";
		const invocations = example.build.choices.find(entry => entry.id === "class:warlock|xphb:invocations").selected;
		const selected = setCharacterChoice(example, "class:warlock|xphb:invocations", [...invocations.slice(1), "lessons-of-the-first-ones|xphb"]);
		const withFeat = setCharacterChoice(selected, `${owner}:feat`, ["magic-initiate-druid|xphb"]);
		const choices = getWarlockChoiceDescriptors(withFeat, catalog, context);
		expect(choices.find(entry => entry.id === `${owner}:feat-ability`).options.map(option => option.id)).toEqual(["int", "wis", "cha"]);
		expect(choices.find(entry => entry.id === `${owner}:feat-cantrips`).count).toBe(2);
		expect(choices.find(entry => entry.id === `${owner}:feat-spell`).options.map(option => option.id)).toEqual(["spell:cure-wounds|xphb"]);
		const cantrips = choices.find(entry => entry.id === `${owner}:feat-cantrips`).options.slice(0, 2).map(option => option.id);
		let document = setCharacterChoice(withFeat, `${owner}:feat-ability`, ["wis"]);
		document = setCharacterChoice(document, `${owner}:feat-cantrips`, cantrips);
		document = setCharacterChoice(document, `${owner}:feat-spell`, ["spell:cure-wounds|xphb"]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.spells.map(entry => entry.id)).toEqual(expect.arrayContaining([...cantrips, "spell:cure-wounds|xphb"]));
		expect(model.resources.find(resource => resource.name === "Cure Wounds")).toMatchObject({maxUses: 1, spellcastingAbility: "wis", healing: {dice: "2d8"}});
	});

	it("matches the reviewed invocations to the original Eldritch Invocation records", () => {
		const records = context.sources.optionalFeatures.optionalfeature.filter(record => record.source === "XPHB" && (record.featureType || []).includes("EI"));
		const annotations = Object.entries(context.rules.invocations);
		expect(annotations).toHaveLength(records.length);
		for (const [id, annotation] of annotations) {
			const record = records.find(candidate => `${candidate.name.toLowerCase().replaceAll("'", "").replaceAll(" ", "-")}|xphb` === id);
			expect(record).toBeDefined();
			expect(annotation.name).toBe(record.name);
			const [prerequisite = {}] = record.prerequisite || [];
			expect(annotation.minimumLevel).toBe(prerequisite.level?.level || 1);
			expect(annotation.requires || []).toEqual((prerequisite.optionalfeature || []).map(value => value.replaceAll(" ", "-")));
			expect(annotation.repeatable === true).toBe(JSON.stringify(record.entries).includes("\"name\":\"Repeatable\""));
		}
	});

	it.each([6, 11, 17, 20])("offers the full reviewed spell list at level %i", level => {
		const draft = createWarlockDraft(catalog.dataset);
		draft.build.level = level;
		const progression = getWarlockSourceChoices(context.sources).progression(level);
		const leveled = {1: 15, 2: 27, 3: 41, 4: 47, 5: 56}[progression.slotLevel];
		const cantrips = choice(draft, "class:warlock|xphb:cantrips");
		const prepared = choice(draft, "class:warlock|xphb:prepared-spells");
		const invocations = choice(draft, "class:warlock|xphb:invocations");
		expect(cantrips).toMatchObject({count: progression.cantrips});
		expect(cantrips.options).toHaveLength(12);
		expect(cantrips.options.every(option => !option.label.startsWith("Spell data unavailable"))).toBe(true);
		expect(prepared).toMatchObject({count: progression.prepared});
		expect(prepared.options).toHaveLength(leveled);
		expect(prepared.options.every(option => !option.label.startsWith("Spell data unavailable"))).toBe(true);
		expect(invocations).toMatchObject({count: progression.invocations});
	});

	it("accepts ten reviewed invocations and their prerequisites at level 20", () => {
		const source = createSheetExamples(catalog.dataset).find(entry => entry.id === "infernal-tiefling-warlock-level-5").document;
		const document = JSON.parse(JSON.stringify(source));
		const owner = "class:warlock|xphb";
		document.build.level = 20;
		addFeatChoices(document, owner, 20);
		const saved = id => document.build.choices.find(value => value.id === `${owner}:${id}`).selected;
		saved("invocations").splice(
			0,
			saved("invocations").length,
			"eldritch-mind|xphb", "armor-of-shadows|xphb", "agonizing-blast|xphb", "devils-sight|xphb", "repelling-blast|xphb",
			"pact-of-the-blade|xphb", "thirsting-blade|xphb", "eldritch-smite|xphb", "lifedrinker|xphb", "devouring-blade|xphb",
		);
		document.build.choices.push({id: `${owner}:pact-weapon`, selected: ["longsword|xphb"]});
		document.build.choices.push({id: `${owner}:epic-boon`, selected: ["boon-of-combat-prowess|xphb"]});
		document.build.choices.push({id: `${owner}:epic-boon-ability`, selected: ["cha"]});
		saved("cantrips").push("spell:chill-touch|xphb");
		saved("prepared-spells").push(
			"spell:bane|xphb", "spell:charm-person|xphb", "spell:comprehend-languages|xphb", "spell:detect-magic|xphb", "spell:expeditious-retreat|xphb",
			"spell:hellish-rebuke|xphb", "spell:illusory-script|xphb", "spell:speak-with-animals|xphb", "spell:witch-bolt|xphb",
		);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues.filter(issue => issue.id === `${owner}:invocations`)).toEqual([]);
		expect(model.features.map(feature => feature.name)).toEqual(expect.arrayContaining(["Thirsting Blade", "Eldritch Smite", "Lifedrinker", "Devouring Blade"]));
	});

	it("keeps a prepared spell list limited to the current Pact Magic slot level", () => {
		const draft = createWarlockDraft(catalog.dataset);
		const options = () => choice(draft, "class:warlock|xphb:prepared-spells").options.map(option => option.id);
		draft.build.level = 3;
		expect(options()).not.toContain("spell:fear|xphb");
		draft.build.level = 5;
		expect(options()).toContain("spell:fear|xphb");
		expect(options()).not.toContain("spell:banishment|xphb");
		draft.build.level = 9;
		expect(options()).toContain("spell:jallarzi's-storm-of-radiance|xphb");
	});

	it("preserves imported different spellcasting abilities and equivalent increase ordering", () => {
		let draft = createWarlockDraft(catalog.dataset);
		draft = setCharacterChoice(draft, "species:tiefling|xphb:spellcasting-ability", ["int"]);
		draft = setCharacterChoice(draft, "feat:magic-initiate-cleric|xphb:ability", ["wis"]);
		draft = setCharacterChoice(draft, "background:acolyte|xphb:ability-increases", ["wis-1.cha-2"]);
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
