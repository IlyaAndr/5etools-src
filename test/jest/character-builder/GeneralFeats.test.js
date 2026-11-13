import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {getFeatAbilityChoice, getFeatProficiencyGrants, getFeatSenses, getFeatTraining, meetsFeatPrerequisites} from "../../../js/character-builder/feat-choices.js";
import {addFeatChoices} from "./test-documents.js";
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
const levelNine = () => {
	const document = levelFive();
	document.build.level = 9;
	addFeatChoices(document, owner, 9);
	return document;
};
const levelNineteen = () => {
	const document = levelFive();
	document.build.level = 19;
	addFeatChoices(document, owner, 19);
	const saved = id => document.build.choices.find(value => value.id === `${owner}:${id}`).selected;
	saved("invocations").splice(
		0,
		saved("invocations").length,
		"eldritch-mind|xphb", "armor-of-shadows|xphb", "agonizing-blast|xphb", "devils-sight|xphb", "repelling-blast|xphb",
		"pact-of-the-blade|xphb", "thirsting-blade|xphb", "eldritch-smite|xphb", "lifedrinker|xphb", "devouring-blade|xphb",
	);
	document.build.choices.push({id: `${owner}:pact-weapon`, selected: ["longsword|xphb"]});
	saved("cantrips").push("spell:chill-touch|xphb");
	saved("prepared-spells").push(
		"spell:bane|xphb", "spell:charm-person|xphb", "spell:comprehend-languages|xphb", "spell:detect-magic|xphb", "spell:expeditious-retreat|xphb",
		"spell:hellish-rebuke|xphb", "spell:illusory-script|xphb", "spell:speak-with-animals|xphb", "spell:witch-bolt|xphb",
	);
	return document;
};

describe("Reviewed general feats", () => {
	it("reads a fixed or chosen ability increase from the source record", () => {
		expect(getFeatAbilityChoice(featRecord("Durable"))).toEqual({fixed: "con", amount: 1, max: 20});
		expect(getFeatAbilityChoice(featRecord("Crusher"))).toEqual({options: ["str", "con"], amount: 1, max: 20});
		expect(getFeatAbilityChoice(featRecord("Boon of Combat Prowess"))).toEqual({options: ["str", "dex", "con", "int", "wis", "cha"], amount: 1, max: 30});
		expect(getFeatAbilityChoice(featRecord("Boon of Irresistible Offense"))).toEqual({options: ["str", "dex"], amount: 1, max: 30});
		expect(getFeatAbilityChoice({name: "Broken", ability: "str"})).toBeNull();
		expect(() => getFeatAbilityChoice({name: "Broken", ability: [{str: 2}]})).toThrow(/Unsupported Broken ability increase/);
	});

	it("offers the reviewed general feats beside Ability Score Improvement", () => {
		const list = getWarlockChoiceDescriptors(levelFive(), catalog, context);
		const feat = list.find(entry => entry.id === `${owner}:level-4-feat`);
		expect(feat.options.map(option => option.id)).toEqual([
			"ability-score-improvement|xphb", "actor|xphb", "athlete|xphb", "charger|xphb", "chef|xphb", "crossbow-expert|xphb", "crusher|xphb",
			"defensive-duelist|xphb", "dual-wielder|xphb", "durable|xphb", "elemental-adept|xphb", "grappler|xphb", "great-weapon-master|xphb",
			"heavily-armored|xphb", "heavy-armor-master|xphb", "inspiring-leader|xphb", "keen-mind|xphb", "lightly-armored|xphb", "mage-slayer|xphb",
			"martial-weapon-training|xphb", "medium-armor-master|xphb", "moderately-armored|xphb", "mounted-combatant|xphb", "observant|xphb",
			"piercer|xphb", "poisoner|xphb", "polearm-master|xphb", "resilient|xphb", "sentinel|xphb", "sharpshooter|xphb",
			"shield-master|xphb", "skill-expert|xphb", "skulker|xphb", "slasher|xphb", "speedy|xphb", "spell-sniper|xphb",
			"telekinetic|xphb", "telepathic|xphb", "war-caster|xphb", "weapon-master|xphb",
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

	it("reads the training and senses a feat grants", () => {
		expect(getFeatTraining(featRecord("Lightly Armored"))).toEqual(["Light armor", "Shields"]);
		expect(getFeatTraining(featRecord("Martial Weapon Training"))).toEqual(["Martial weapons"]);
		expect(getFeatTraining(featRecord("Crusher"))).toEqual([]);
		expect(getFeatSenses(featRecord("Skulker"))).toEqual([{type: "blindsight", range: 10}]);
		expect(getFeatSenses(featRecord("Crusher"))).toEqual([]);
	});

	it("applies armor training from a feat", () => {
		const model = createCharacterSheetModel(withFeat("lightly-armored|xphb", "dex"), catalog, context);
		expect(model.status).toBe("complete");
		expect(model.training).toEqual(expect.arrayContaining(["Light armor", "Shields"]));
		expect(model.features.some(feature => feature.name === "Lightly Armored")).toBe(true);
	});

	it("applies a feat's blindsight sense", () => {
		const model = createCharacterSheetModel(withFeat("skulker|xphb"), catalog, context);
		expect(model.status).toBe("complete");
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "blindsight", range: 10, provenance: "Skulker"}));
	});

	describe("proficiency-granting general feats", () => {
		const withChoice = (featId, ability, proficiencies) => {
			let document = withFeat(featId, ability);
			if (proficiencies) document.build.choices.push({id: `${owner}:level-4-feat-proficiency`, selected: proficiencies});
			return document;
		};
		// Keen Mind needs Intelligence 13+; swap the reference build's Int and Cha,
		// which keeps the same standard array.
		const keenMind = (proficiencies) => {
			const document = withChoice("keen-mind|xphb", undefined, proficiencies);
			document.build.abilities.scores = {...document.build.abilities.scores, int: 15, cha: 12};
			return document;
		};

		it("grants Chef's cook's utensils", () => {
			const model = createCharacterSheetModel(withChoice("chef|xphb", "con"), catalog, context);
			expect(model.issues).toEqual([]);
			expect(model.training).toContain("Cook's Utensils");
		});

		it("grants the Poisoner's Kit", () => {
			const model = createCharacterSheetModel(withChoice("poisoner|xphb", "dex"), catalog, context);
			expect(model.issues).toEqual([]);
			expect(model.training).toContain("Poisoner's Kit");
		});

		it("offers Keen Mind's five skills and applies the chosen one", () => {
			const document = keenMind(["skill:nature"]);
			const descriptor = getWarlockChoiceDescriptors(document, catalog, context).find(entry => entry.id === `${owner}:level-4-feat-proficiency`);
			expect(descriptor.options).toHaveLength(5);
			const model = createCharacterSheetModel(document, catalog, context);
			expect(model.issues).toEqual([]);
			expect(model.abilities.flatMap(ability => ability.skills).find(skill => skill.id === "nature").proficient).toBe(true);
		});

		it("rejects a Keen Mind skill the build already has", () => {
			const model = createCharacterSheetModel(keenMind(["skill:religion"]), catalog, context);
			expect(model.status).toBe("incomplete");
			expect(model.issues).toContainEqual(expect.objectContaining({id: `${owner}:level-4-feat-proficiency`}));
		});

		it("adds Resilient's saving throw proficiency in the chosen ability", () => {
			const model = createCharacterSheetModel(withChoice("resilient|xphb", "str"), catalog, context);
			expect(model.issues).toEqual([]);
			const strength = model.abilities.find(ability => ability.id === "str");
			expect(strength.saveProficient).toBe(true);
			expect(strength.save - strength.modifier).toBe(model.proficiencyBonus);
		});

		it("rejects Resilient for an ability that already has saving throw proficiency", () => {
			const model = createCharacterSheetModel(withChoice("resilient|xphb", "cha"), catalog, context);
			expect(model.status).toBe("incomplete");
			expect(model.issues).toContainEqual(expect.objectContaining({id: `${owner}:level-4-feat`}));
		});

		it("doubles the proficient skill's bonus for Skill Expert", () => {
			const base = withChoice("skill-expert|xphb", "dex");
			base.build.choices.push({id: `${owner}:level-4-feat-proficiency`, selected: ["skill:animal-handling"]});
			base.build.choices.push({id: `${owner}:level-4-feat-expertise`, selected: ["animal-handling"]});
			const model = createCharacterSheetModel(base, catalog, context);
			expect(model.issues).toEqual([]);
			const skill = model.abilities.flatMap(ability => ability.skills).find(entry => entry.id === "animal-handling");
			const wisdom = model.abilities.find(ability => ability.id === "wis");
			expect(skill).toMatchObject({proficient: true, expertise: true});
			expect(skill.modifier - wisdom.modifier).toBe(model.proficiencyBonus * 2);
		});

		it("rejects Skill Expert expertise on a skill it does not have", () => {
			const base = withChoice("skill-expert|xphb", "dex");
			base.build.choices.push({id: `${owner}:level-4-feat-proficiency`, selected: ["skill:animal-handling"]});
			base.build.choices.push({id: `${owner}:level-4-feat-expertise`, selected: ["athletics"]});
			const model = createCharacterSheetModel(base, catalog, context);
			expect(model.status).toBe("incomplete");
			expect(model.issues).toContainEqual(expect.objectContaining({id: `${owner}:level-4-feat-expertise`}));
		});

		it("adds Telekinetic's Mage Hand as a feat spell", () => {
			const model = createCharacterSheetModel(withChoice("telekinetic|xphb", "int"), catalog, context);
			expect(model.issues).toEqual([]);
			const spell = model.spells.find(entry => entry.id === "spell:mage-hand|xphb");
			expect(spell).toBeDefined();
			expect(spell.sources.some(source => source.kind === "feat" && source.ability === "int")).toBe(true);
			expect(model.resources.some(resource => resource.name === "Mage Hand")).toBe(false);
		});

		it("adds Telepathic's Detect Thoughts with a long-rest free cast", () => {
			const model = createCharacterSheetModel(withChoice("telepathic|xphb", "wis"), catalog, context);
			expect(model.issues).toEqual([]);
			expect(model.spells.some(entry => entry.id === "spell:detect-thoughts|xphb")).toBe(true);
			expect(model.resources.find(resource => resource.name === "Detect Thoughts")).toMatchObject({maxUses: 1, freeLevel: 1, spellcastingAbility: "wis"});
		});
	});

	it("checks an armor-proficiency prerequisite against the character's training", () => {
		const heavy = featRecord("Heavy Armor Master");
		expect(meetsFeatPrerequisites(heavy, {level: 4, scores: {}, proficiencies: {armor: new Set(["heavy"])}})).toBe(true);
		expect(meetsFeatPrerequisites(heavy, {level: 4, scores: {}, proficiencies: {armor: new Set(["light", "shield"])}})).toBe(false);
		expect(() => meetsFeatPrerequisites(heavy, {level: 4, scores: {}})).toThrow(/armor proficiencies/);
		expect(() => meetsFeatPrerequisites({name: "Broken", prerequisite: [{level: 4, proficiency: [{weapon: "martial"}]}]}, {level: 4, scores: {}, proficiencies: {armor: new Set(["heavy"])}}))
			.toThrow(/Unsupported Broken proficiency prerequisite weapon/);
	});

	it("reads the armor proficiency a feat grants", () => {
		expect(getFeatProficiencyGrants(featRecord("Lightly Armored"))).toEqual({armor: ["light", "shield"], weapons: []});
		expect(getFeatProficiencyGrants(featRecord("Moderately Armored"))).toEqual({armor: ["medium"], weapons: []});
		expect(getFeatProficiencyGrants(featRecord("Martial Weapon Training"))).toEqual({armor: [], weapons: ["martial"]});
	});

	it("accepts a feat whose armor prerequisite the class already meets", () => {
		const model = createCharacterSheetModel(withFeat("moderately-armored|xphb", "dex"), catalog, context);
		expect(model.status).toBe("complete");
		expect(model.training).toContain("Medium armor");
	});

	it("rejects a feat whose armor prerequisite the class misses", () => {
		const model = createCharacterSheetModel(withFeat("heavily-armored|xphb", "con"), catalog, context);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: `${owner}:level-4-feat`, message: "Heavily Armored: the feat's prerequisites are not met."}));
		expect(model.features.some(feature => feature.name === "Heavily Armored")).toBe(false);
	});

	it("carries a feat's armor training into a later feat's prerequisite", () => {
		let document = levelNine();
		document.build.choices.find(saved => saved.id === `${owner}:invocations`).selected = [
			"eldritch-mind|xphb", "agonizing-blast|xphb", "armor-of-shadows|xphb", "devils-sight|xphb", "repelling-blast|xphb",
			"pact-of-the-blade|xphb", "lifedrinker|xphb",
		];
		document.build.choices.push({id: `${owner}:pact-weapon`, selected: ["longsword|xphb"]});
		document.build.choices.find(saved => saved.id === `${owner}:prepared-spells`).selected.push("spell:bane|xphb", "spell:charm-person|xphb", "spell:comprehend-languages|xphb", "spell:detect-magic|xphb");
		document = setCharacterChoice(document, `${owner}:level-4-feat`, ["moderately-armored|xphb"]);
		document = setCharacterChoice(document, `${owner}:level-4-feat-ability`, ["dex"]);
		document = setCharacterChoice(document, `${owner}:level-4-ability-increases`, []);
		document = setCharacterChoice(document, `${owner}:level-8-feat`, ["heavily-armored|xphb"]);
		document = setCharacterChoice(document, `${owner}:level-8-feat-ability`, ["con"]);
		document = setCharacterChoice(document, `${owner}:level-8-ability-increases`, []);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.training).toEqual(expect.arrayContaining(["Medium armor", "Heavy armor"]));
		expect(model.features.some(feature => feature.name === "Heavily Armored")).toBe(true);
	});
});

describe("Epic Boons", () => {
	const boons = [
		"boon-of-combat-prowess|xphb", "boon-of-dimensional-travel|xphb", "boon-of-energy-resistance|xphb", "boon-of-fate|xphb",
		"boon-of-fortitude|xphb", "boon-of-irresistible-offense|xphb", "boon-of-recovery|xphb", "boon-of-skill|xphb",
		"boon-of-speed|xphb", "boon-of-spell-recall|xphb", "boon-of-the-night-spirit|xphb", "boon-of-truesight|xphb",
	];

	it("offers the reviewed Epic Boons only at level 19", () => {
		const atFive = getWarlockChoiceDescriptors(levelFive(), catalog, context).find(entry => entry.id === `${owner}:epic-boon`);
		expect(atFive).toMatchObject({available: false, minimumLevel: 19});
		const atNineteen = getWarlockChoiceDescriptors(levelNineteen(), catalog, context);
		const boon = atNineteen.find(entry => entry.id === `${owner}:epic-boon`);
		expect(boon.available).toBe(true);
		expect(boon.options.slice(0, boons.length).map(option => option.id)).toEqual(boons);
		expect(boon.options).toHaveLength(boons.length + context.rules.classes["warlock|xphb"].generalFeats.length);
		expect(atNineteen.find(entry => entry.id === `${owner}:epic-boon-ability`)).toBeUndefined();
	});

	it("offers the chosen boon's ability options", () => {
		const document = setCharacterChoice(levelNineteen(), `${owner}:epic-boon`, ["boon-of-truesight|xphb"]);
		const ability = getWarlockChoiceDescriptors(document, catalog, context).find(entry => entry.id === `${owner}:epic-boon-ability`);
		expect(ability.options.map(option => option.id)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
	});

	it("reads a boon's truesight sense beside a general feat's blindsight", () => {
		expect(getFeatSenses(featRecord("Boon of Truesight"))).toEqual([{type: "truesight", range: 60}]);
		expect(getFeatSenses(featRecord("Skulker"))).toEqual([{type: "blindsight", range: 10}]);
		expect(() => getFeatSenses({name: "Broken", senses: [{darkvision: 60}]})).toThrow(/Unsupported Broken sense/);
	});

	it("raises an ability above 20 up to the boon's maximum", () => {
		let document = levelNineteen();
		document = setCharacterChoice(document, `${owner}:level-4-ability-increases`, ["cha-2"]);
		document = setCharacterChoice(document, `${owner}:level-8-ability-increases`, ["cha-1.wis-1"]);
		document = setCharacterChoice(document, `${owner}:epic-boon`, ["boon-of-combat-prowess|xphb"]);
		document = setCharacterChoice(document, `${owner}:epic-boon-ability`, ["cha"]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(score(model, "cha")).toBe(21);
		expect(model.features.some(feature => feature.name === "Boon of Combat Prowess")).toBe(true);
	});

	it("applies a boon's truesight to the sheet", () => {
		let document = levelNineteen();
		document = setCharacterChoice(document, `${owner}:epic-boon`, ["boon-of-truesight|xphb"]);
		document = setCharacterChoice(document, `${owner}:epic-boon-ability`, ["wis"]);
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.issues).toEqual([]);
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "truesight", range: 60, provenance: "Boon of Truesight"}));
		expect(model.features.some(feature => feature.name === "Boon of Truesight")).toBe(true);
	});
});
