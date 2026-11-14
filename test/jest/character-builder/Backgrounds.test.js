import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createEditorDraft, getEditorChoiceDescriptors} from "../../../js/character-builder/editor-profile.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";
import {getFeatChoiceDescriptors} from "../../../js/character-builder/feat-choices.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const races = readJson("../../../data/races.json");
const rules = readJson("../../../js/character-builder/rules/character-sheet.json");
const sources = {
	skills: readJson("../../../data/skills.json"),
	abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
	races,
	fighter: readJson("../../../data/class/class-fighter.json"),
	backgrounds: readJson("../../../data/backgrounds.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
	spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
};
const catalog = createSpeciesCatalog({races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {catalog, rules, spells, sources};
const ref = name => ({name, source: "XPHB"});
const backgroundIds = Object.keys(rules.backgrounds);

/** Fill every available choice with its first legal options. */
function completeDocument (document) {
	const invocationCantrips = new Set(Object.values(rules.invocations).flatMap(invocation => invocation.cantripOptions || []));
	let current = document;
	for (let pass = 0; pass < 100; pass++) {
		const pending = getEditorChoiceDescriptors(current, catalog, context)
			.find(descriptor => descriptor.available && descriptor.selected.length !== descriptor.count);
		if (!pending) return current;
		const bare = id => id.replace(/^skill:/, "").replace(/^tool:/, "");
		const backgroundRule = rules.backgrounds[`${current.build.background.name.toLowerCase()}|${current.build.background.source.toLowerCase()}`];
		const granted = new Set([...(backgroundRule?.skills || []), ...current.build.choices.flatMap(choice => choice.selected).map(bare)]);
		// A feat's proficiency choice cannot repeat a proficiency the build already has.
		const usable = pending.id.endsWith(":proficiencies") ? pending.options.filter(option => !granted.has(bare(option.id))) : pending.options;
		const ordered = [...usable].sort((left, right) => Number(invocationCantrips.has(right.id)) - Number(invocationCantrips.has(left.id)));
		const selected = ordered.slice(0, pending.count).map(option => option.id);
		if (selected.length !== pending.count) throw new TypeError(`Cannot complete ${pending.id}: not enough options.`);
		current = setCharacterChoice(current, pending.id, selected);
	}
	throw new TypeError("The draft could not be completed.");
}

const draftFor = (background, level = 1) => {
	const document = createEditorDraft(catalog.dataset, {species: ref("Tiefling"), characterClass: ref("Warlock"), background: ref(background)}, context);
	document.build.level = level;
	document.build.abilities.scores = {str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8};
	return completeDocument(document);
};
const modelFor = document => createCharacterSheetModel(document, catalog, context);
const training = model => model.training;

describe("Reviewed backgrounds", () => {
	it("covers all sixteen 2024 backgrounds with a reviewed tool catalog", () => {
		expect(backgroundIds).toHaveLength(16);
		expect(Object.keys(rules.tools)).toHaveLength(37);
		for (const id of backgroundIds) {
			const background = rules.backgrounds[id];
			expect(background.featId).toBe(`${background.featId}`);
			expect(rules.feats[background.featId]).toBeDefined();
			if (background.toolOptions) {
				expect(Object.keys(background.toolOptions).length).toBeGreaterThanOrEqual(1);
				for (const [toolId, label] of Object.entries(background.toolOptions)) {
					expect(rules.tools[toolId]).toBe(label);
				}
			} else {
				expect(typeof background.tool).toBe("string");
			}
		}
	});

	it.each(backgroundIds)("builds a complete level-1 Warlock with the %s background", id => {
		const document = draftFor(rules.backgrounds[id].name);
		const model = modelFor(document);
		expect(model.issues).toEqual([]);
		expect(model.status).toBe("complete");
		expect(model.document.build.background).toEqual(ref(rules.backgrounds[id].name));
		expect(model.features.some(feature => feature.name === rules.feats[rules.backgrounds[id].featId].record.name)).toBe(true);
	});

	it("grants the fixed background tool and its two skills", () => {
		const model = modelFor(draftFor("Criminal"));
		expect(training(model)).toContain("Thieves' Tools");
		const skills = model.abilities.flatMap(ability => ability.skills).filter(skill => skill.proficient).map(skill => skill.id);
		expect(skills).toEqual(expect.arrayContaining(["sleight-of-hand", "stealth"]));
	});

	it("offers every tool of a category and applies the chosen one", () => {
		const document = draftFor("Guard");
		const tool = getEditorChoiceDescriptors(document, catalog, context).find(descriptor => descriptor.id === "background:guard|xphb:tool");
		expect(tool.options.map(option => option.id)).toEqual(["dice-set|xphb", "dragonchess-set|xphb", "playing-cards|xphb", "three-dragon-ante-set|xphb"]);
		const chosen = setCharacterChoice(document, "background:guard|xphb:tool", ["playing-cards|xphb"]);
		const model = modelFor(chosen);
		expect(model.issues).toEqual([]);
		expect(training(model)).toContain("Playing Cards");
		expect(training(model)).not.toContain("Dice Set");
	});
});

describe("Reviewed Origin feats", () => {
	const featDescriptors = document => getFeatChoiceDescriptors(document, {rules, sources, spells});
	const choiceOf = (document, id) => document.build.choices.find(choice => choice.id === id)?.selected || [];

	it("offers Skilled three skills or tools and applies both kinds", () => {
		const document = draftFor("Charlatan");
		const descriptor = featDescriptors(document).find(entry => entry.id === "feat:skilled|xphb:proficiencies");
		expect(descriptor.count).toBe(3);
		expect(descriptor.options.filter(option => option.id.startsWith("tool:"))).toHaveLength(37);
		expect(descriptor.options.filter(option => option.id.startsWith("skill:"))).toHaveLength(18);
		const toolsOnly = setCharacterChoice(document, "feat:skilled|xphb:proficiencies", ["tool:smiths-tools|xphb", "tool:lute|xphb", "tool:dice-set|xphb"]);
		const toolsModel = modelFor(toolsOnly);
		expect(toolsModel.issues).toEqual([]);
		for (const label of ["Smith's Tools", "Lute", "Dice Set"]) expect(training(toolsModel)).toContain(label);
		const free = modelFor(document).abilities.flatMap(ability => ability.skills).filter(skill => !skill.proficient).map(skill => skill.id).slice(0, 3);
		const skillModel = modelFor(setCharacterChoice(document, "feat:skilled|xphb:proficiencies", free.map(id => `skill:${id}`)));
		expect(skillModel.issues).toEqual([]);
		const proficient = skillModel.abilities.flatMap(ability => ability.skills).filter(skill => skill.proficient).map(skill => skill.id);
		expect(proficient).toEqual(expect.arrayContaining(free));
	});

	it("offers Crafter its eight artisan's tools and applies the chosen three", () => {
		const document = draftFor("Artisan");
		const descriptor = featDescriptors(document).find(entry => entry.id === "feat:crafter|xphb:proficiencies");
		expect(descriptor.count).toBe(3);
		expect(descriptor.options).toHaveLength(8);
		expect(descriptor.options.map(option => option.id)).toEqual(expect.arrayContaining(["tool:carpenters-tools|xphb", "tool:smiths-tools|xphb"]));
		const model = modelFor(document);
		expect(model.issues).toEqual([]);
		for (const id of choiceOf(document, "feat:crafter|xphb:proficiencies")) expect(training(model)).toContain(rules.tools[id.slice(5)]);
	});

	it("offers Musician the ten instruments and applies the chosen three", () => {
		const document = draftFor("Entertainer");
		const descriptor = featDescriptors(document).find(entry => entry.id === "feat:musician|xphb:proficiencies");
		expect(descriptor.count).toBe(3);
		expect(descriptor.options).toHaveLength(10);
		const model = modelFor(document);
		expect(model.issues).toEqual([]);
		for (const id of choiceOf(document, "feat:musician|xphb:proficiencies")) expect(training(model)).toContain(rules.tools[id.slice(5)]);
	});

	it("rejects repeating a proficiency the build already grants", () => {
		const document = setCharacterChoice(draftFor("Charlatan"), "feat:skilled|xphb:proficiencies", ["skill:deception", "tool:lute|xphb", "tool:dice-set|xphb"]);
		const model = modelFor(document);
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual(expect.objectContaining({id: "feat:skilled|xphb:proficiencies"}));
	});

	it("offers any level-1 Druid spell and tracks the chosen one as a free cast", () => {
		const draft = draftFor("Guide");
		const cantrips = featDescriptors(draft).find(entry => entry.id === "feat:magic-initiate-druid|xphb:cantrips");
		expect(cantrips.options.map(option => option.id)).toContain("spell:guidance|xphb");
		expect(cantrips.options.map(option => option.id)).not.toContain("spell:eldritch-blast|xphb");
		const spells = featDescriptors(draft).find(entry => entry.id === "feat:magic-initiate-druid|xphb:spell");
		expect(spells.options.length).toBeGreaterThan(1);
		expect(spells.options.map(option => option.id)).toContain("spell:cure-wounds|xphb");
		expect(spells.options.every(option => option.spell.level === 1)).toBe(true);
		const document = setCharacterChoice(draft, "feat:magic-initiate-druid|xphb:spell", ["spell:cure-wounds|xphb"]);
		const model = modelFor(document);
		expect(model.issues).toEqual([]);
		expect(model.resources.find(resource => resource.id === "feat:magic-initiate-druid|xphb:cure-wounds")).toMatchObject({
			name: "Cure Wounds",
			maxUses: 1,
			spellId: "spell:cure-wounds|xphb",
		});
	});

	it("offers any level-1 Wizard spell and tracks the chosen one as a free cast", () => {
		const draft = draftFor("Sage");
		const spells = featDescriptors(draft).find(entry => entry.id === "feat:magic-initiate-wizard|xphb:spell");
		expect(spells.options.length).toBeGreaterThan(1);
		expect(spells.options.map(option => option.id)).toContain("spell:shield|xphb");
		const model = modelFor(setCharacterChoice(draft, "feat:magic-initiate-wizard|xphb:spell", ["spell:shield|xphb"]));
		expect(model.issues).toEqual([]);
		const resource = model.resources.find(entry => entry.id === "feat:magic-initiate-wizard|xphb:shield");
		expect(resource).toMatchObject({name: "Shield", maxUses: 1, spellId: "spell:shield|xphb"});
		expect(resource.healing).toBeUndefined();
	});
});
