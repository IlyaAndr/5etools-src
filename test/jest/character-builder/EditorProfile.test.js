import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {applySingleOptionSelections, setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {createEditorDraft, findSharedSpellcastingAbility, getEditorChoiceDescriptors, getEditorCombinations, isSupportedEditorDocument} from "../../../js/character-builder/editor-profile.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const races = readJson("../../../data/races.json");
const catalog = createSpeciesCatalog({races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {
	catalog,
	rules: readJson("../../../js/character-builder/rules/character-sheet.json"),
	spells,
	sources: {
		races,
		spells,
		abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
		skills: readJson("../../../data/skills.json"),
		fighter: readJson("../../../data/class/class-fighter.json"),
		warlock: readJson("../../../data/class/class-warlock.json"),
		backgrounds: readJson("../../../data/backgrounds.json"),
		optionalFeatures: readJson("../../../data/optionalfeatures.json"),
		feats: readJson("../../../data/feats.json"),
		itemMasteries: readJson("../../../data/items-base.json"),
		spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
	},
};
const ref = (name, source = "XPHB") => ({name, source});
const combinations = [ref("Gnome"), ref("Tiefling")].flatMap(entrySpecies => [ref("Fighter"), ref("Warlock")].flatMap(characterClass => [ref("Soldier"), ref("Acolyte")].map(background => ({
	label: `${entrySpecies.name} / ${background.name} / ${characterClass.name}`,
	species: entrySpecies,
	characterClass,
	background,
}))));
const classId = characterClass => `${characterClass.name.toLowerCase()}|xphb`;

function draftFor ({species, characterClass, background}, level = 1) {
	const document = createEditorDraft(catalog.dataset, {species, characterClass, background}, context);
	document.build.level = level;
	document.build.abilities.scores = {str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8};
	return document;
}

// Fill every available choice with its first legal options, recomputing dependent
// descriptors (such as invocation cantrips) after each decision.
function completeDocument (document) {
	// An invocation's reviewed cantrip must also be a known Warlock cantrip, so
	// prefer those when a choice has more options than it needs.
	const invocationCantrips = new Set(Object.values(context.rules.invocations).flatMap(invocation => invocation.cantripOptions || []));
	const order = descriptor => [...descriptor.options].sort((left, right) => Number(invocationCantrips.has(right.id)) - Number(invocationCantrips.has(left.id)));
	let current = document;
	for (let pass = 0; pass < 100; pass++) {
		const descriptors = getEditorChoiceDescriptors(current, catalog, context);
		const pending = descriptors.find(descriptor => descriptor.available && descriptor.selected.length !== descriptor.count);
		if (!pending) return current;
		const selected = order(pending).slice(0, pending.count).map(option => option.id);
		if (selected.length !== pending.count) throw new TypeError(`Cannot complete ${pending.id}: not enough options.`);
		current = setCharacterChoice(current, pending.id, selected);
	}
	throw new TypeError("Choice completion did not converge.");
}

describe("Independent editor composition", () => {
	it("lists independent species, class, and background sources", () => {
		const available = getEditorCombinations({catalog, rules: context.rules});
		expect(available.species).toEqual([ref("Gnome"), ref("Tiefling")]);
		expect(available.classes).toEqual([ref("Fighter"), ref("Warlock")]);
		expect(available.backgrounds).toEqual([
			ref("Acolyte"), ref("Artisan"), ref("Charlatan"), ref("Criminal"), ref("Entertainer"), ref("Farmer"), ref("Guard"), ref("Guide"),
			ref("Hermit"), ref("Merchant"), ref("Noble"), ref("Sage"), ref("Sailor"), ref("Scribe"), ref("Soldier"), ref("Wayfarer"),
		]);
	});

	it.each(combinations)("composes $label choices at levels 1, 3, and 5", ({species, characterClass, background}) => {
		for (const level of [1, 3, 5]) {
			const document = completeDocument(draftFor({species, characterClass, background}, level));
			const model = createCharacterSheetModel(document, catalog, context);
			expect(model.status).toBe("complete");
			expect(model.issues).toEqual([]);
			expect(model.className).toBe(characterClass.name);
			expect(model.document.build.species).toEqual(species);
			expect(model.document.build.background).toEqual(background);
		}
	});

	it.each(combinations)("keeps the class equipment package for $label", ({species, characterClass, background}) => {
		const document = completeDocument(draftFor({species, characterClass, background}));
		const id = classId(characterClass);
		const equipment = document.build.choices.find(choice => choice.id === `class:${id}:equipment`);
		expect(equipment.selected).toEqual([id === "fighter|xphb" ? "fighter-sword-and-shield" : "warlock-pact-mage"]);
		const model = createCharacterSheetModel(document, catalog, context);
		const backgroundGear = context.rules.backgrounds[`${background.name.toLowerCase()}|xphb`].equipment.gear;
		expect(model.gear).toEqual(expect.arrayContaining(backgroundGear));
	});

	it("provides species, background, feat, and class choices from independent sources", () => {
		const soldier = draftFor({species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Soldier")}, 5);
		const soldierChoices = getEditorChoiceDescriptors(soldier, catalog, context);
		const soldierIds = soldierChoices.map(descriptor => descriptor.id);
		expect(soldierIds).toEqual(expect.arrayContaining([
			"species:tiefling|xphb:legacy",
			"species:tiefling|xphb:spellcasting-ability",
			"species:tiefling|xphb:size",
			"background:soldier|xphb:ability-increases",
			"background:soldier|xphb:tool",
			"character:languages",
			"class:fighter|xphb:skills",
			"class:fighter|xphb:equipment",
			"class:fighter|xphb:fighting-style",
			"class:fighter|xphb:weapon-masteries",
			"class:fighter|xphb:subclass",
			"class:fighter|xphb:level-4-feat",
			"class:fighter|xphb:level-4-ability-increases",
		]));
		expect(soldierIds).not.toContain("feat:magic-initiate-cleric|xphb:ability");
		const classSkills = soldierChoices.find(descriptor => descriptor.id === "class:fighter|xphb:skills");
		expect(classSkills.options.map(option => option.id)).not.toContain("athletics");

		const acolyte = draftFor({species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Acolyte")}, 5);
		const acolyteIds = getEditorChoiceDescriptors(acolyte, catalog, context).map(descriptor => descriptor.id);
		expect(acolyteIds).toEqual(expect.arrayContaining([
			"background:acolyte|xphb:ability-increases",
			"feat:magic-initiate-cleric|xphb:ability",
			"feat:magic-initiate-cleric|xphb:cantrips",
			"feat:magic-initiate-cleric|xphb:spell",
		]));
	});

	it("preselects one shared spellcasting ability only when the class fixes it", () => {
		expect(findSharedSpellcastingAbility({species: ref("Gnome"), characterClass: ref("Warlock"), background: ref("Soldier")}, context)).toBe("cha");
		expect(findSharedSpellcastingAbility({species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Acolyte")}, context)).toBeNull();
		const warlock = draftFor({species: ref("Gnome"), characterClass: ref("Warlock"), background: ref("Soldier")});
		expect(warlock.build.choices).toEqual([{id: "species:gnome|xphb:spellcasting-ability", selected: ["cha"]}]);
		const fighter = draftFor({species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Acolyte")});
		expect(fighter.build.choices).toEqual([]);
	});

	it("fills single-option choices without inventing multi-option decisions", () => {
		const selection = {species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Soldier")};
		const document = draftFor(selection);
		const autoSelected = applySingleOptionSelections(document, getEditorChoiceDescriptors(document, catalog, context));
		expect(autoSelected.build.choices).toEqual(expect.arrayContaining([
			{id: "background:soldier|xphb:tool", selected: ["dice-set|xphb"]},
			{id: "class:fighter|xphb:equipment", selected: ["fighter-sword-and-shield"]},
			{id: "class:fighter|xphb:fighting-style", selected: ["defense|xphb"]},
			{id: "character:languages", selected: ["common"]},
		]));
		for (const id of ["class:fighter|xphb:skills", "class:fighter|xphb:weapon-masteries", "background:soldier|xphb:ability-increases"]) {
			expect(autoSelected.build.choices.some(choice => choice.id === id)).toBe(false);
		}
		expect(applySingleOptionSelections(autoSelected, getEditorChoiceDescriptors(autoSelected, catalog, context))).toBe(autoSelected);

		const fifth = draftFor(selection, 5);
		const fifthSelected = applySingleOptionSelections(fifth, getEditorChoiceDescriptors(fifth, catalog, context));
		expect(fifthSelected.build.choices.find(choice => choice.id === "class:fighter|xphb:subclass").selected).toEqual(["champion|xphb"]);
		expect(autoSelected.build.choices.some(choice => choice.id === "class:fighter|xphb:subclass")).toBe(false);
	});

	it("marks required languages and explains fixed single-option abilities", () => {
		const warlock = draftFor({species: ref("Tiefling"), characterClass: ref("Warlock"), background: ref("Acolyte")});
		const choices = getEditorChoiceDescriptors(warlock, catalog, context);
		const languages = choices.find(descriptor => descriptor.id === "character:languages");
		expect(languages.required).toEqual(["common"]);
		expect(languages.help).toMatch(/every 2024 character knows common/i);
		const speciesAbility = choices.find(descriptor => descriptor.id === "species:tiefling|xphb:spellcasting-ability");
		expect(speciesAbility.options.map(option => option.id)).toEqual(["cha"]);
		expect(speciesAbility.help).toMatch(/only spellcasting ability allowed by every selected source/);
		const size = choices.find(descriptor => descriptor.id === "species:tiefling|xphb:size");
		expect(size.help).toMatch(/lists Small or Medium/);
	});

	it("adds required options without replacing saved choices or exceeding the count", () => {
		const selection = {species: ref("Tiefling"), characterClass: ref("Fighter"), background: ref("Soldier")};
		const document = draftFor(selection);
		const languages = updated => updated.build.choices.find(choice => choice.id === "character:languages")?.selected;
		expect(languages(applySingleOptionSelections(document, getEditorChoiceDescriptors(document, catalog, context)))).toEqual(["common"]);

		const valid = setCharacterChoice(document, "character:languages", ["common", "elvish", "dwarvish"]);
		expect(languages(applySingleOptionSelections(valid, getEditorChoiceDescriptors(valid, catalog, context)))).toEqual(["common", "elvish", "dwarvish"]);

		const withoutCommon = setCharacterChoice(document, "character:languages", ["elvish", "dwarvish", "gnomish"]);
		expect(languages(applySingleOptionSelections(withoutCommon, getEditorChoiceDescriptors(withoutCommon, catalog, context)))).toEqual(["elvish", "dwarvish", "gnomish"]);
	});

	it("keeps saved spellcasting differences visible without offering conflicts", () => {
		let document = draftFor({species: ref("Gnome"), characterClass: ref("Warlock"), background: ref("Acolyte")});
		document = setCharacterChoice(document, "species:gnome|xphb:spellcasting-ability", ["int"]);
		document = setCharacterChoice(document, "feat:magic-initiate-cleric|xphb:ability", ["wis"]);
		const choices = getEditorChoiceDescriptors(document, catalog, context);
		const speciesAbility = choices.find(descriptor => descriptor.id === "species:gnome|xphb:spellcasting-ability");
		const featAbility = choices.find(descriptor => descriptor.id === "feat:magic-initiate-cleric|xphb:ability");
		expect(speciesAbility.options.map(option => option.id)).toEqual(["int", "cha"]);
		expect(featAbility.options.map(option => option.id)).toEqual(["wis", "cha"]);
	});

	it("supports Warlock levels through 20 while keeping the Fighter review at level 5", () => {
		const warlock = draftFor({species: ref("Tiefling"), characterClass: ref("Warlock"), background: ref("Acolyte")}, 20);
		expect(isSupportedEditorDocument(warlock, context)).toBe(true);
		const fighter = draftFor({species: ref("Gnome"), characterClass: ref("Fighter"), background: ref("Soldier")}, 6);
		expect(isSupportedEditorDocument(fighter, context)).toBe(false);
		expect(getEditorChoiceDescriptors(fighter, catalog, context)).toEqual([]);
	});

	it("does not invent choices for unsupported combinations", () => {
		const document = draftFor({species: ref("Gnome"), characterClass: ref("Fighter"), background: ref("Soldier")});
		expect(isSupportedEditorDocument(document, context)).toBe(true);
		document.build.class = ref("Rogue");
		expect(isSupportedEditorDocument(document, context)).toBe(false);
		expect(getEditorChoiceDescriptors(document, catalog, context)).toEqual([]);
		expect(() => createEditorDraft(catalog.dataset, {species: ref("Gnome"), characterClass: ref("Rogue"), background: ref("Soldier")}, context)).toThrow(/Unsupported editor class/);
		expect(() => createEditorDraft(catalog.dataset, {species: ref("Human"), characterClass: ref("Fighter"), background: ref("Soldier")}, context)).toThrow(/Unsupported editor species/);
	});
});
