import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {parseCharacterDocument, serializeCharacterDocument} from "../../../js/character-builder/character-document.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rawSpells = readJson("../../../data/spells/spells-xphb.json");
const rules = readJson("../../../js/character-builder/rules/character-sheet.json");
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
};
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells: rawSpells,
	rules: readJson("../../../js/character-builder/rules/species.json"),
});
const context = {rules, spells: rawSpells, sources};
const example = (characterClass = "Fighter", level = 5) => createSheetExamples(catalog.dataset).find(candidate => candidate.document.build.class.name === characterClass && candidate.document.build.level === level).document;
const project = document => createCharacterSheetModel(document, catalog, context);
const choice = (document, suffix) => document.build.choices.find(candidate => candidate.id.endsWith(suffix));

describe("Reviewed character sheet calculations", () => {
	it("requires the canonical skills data and uses its ability associations", () => {
		const missing = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, skills: undefined}});
		expect(missing.issues).toContainEqual(expect.objectContaining({id: "source-skills"}));
		const skills = JSON.parse(JSON.stringify(sources.skills));
		skills.skill.find(skill => skill.name === "Survival" && skill.source === "XPHB").ability = "cha";
		const model = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, skills}});
		expect(model.abilities.find(ability => ability.id === "cha").skills).toEqual(expect.arrayContaining([expect.objectContaining({id: "survival"})]));
	});

	it("requires canonical ability names and uses the injected labels", () => {
		const missing = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, abilityNames: undefined}});
		expect(missing.issues).toContainEqual(expect.objectContaining({id: "source-ability-names"}));
		const abilityNames = {...sources.abilityNames, str: "Test Strength"};
		const model = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, abilityNames}});
		expect(model.abilities.find(ability => ability.id === "str").name).toBe("Test Strength");
	});
	it.each(["Fighter", "Warlock"])("copies full canonical source entries for %s features", characterClass => {
		const model = project(example(characterClass));
		const race = sources.races.race.find(record => record.name === model.document.build.species.name && record.source === "XPHB");
		const classData = sources[characterClass.toLowerCase()];
		const dataByType = {
			race: race.entries,
			classFeature: classData.classFeature,
			subclassFeature: classData.subclassFeature,
			feat: sources.feats.feat,
			itemMastery: sources.itemMasteries.itemMastery,
			optionalfeature: sources.optionalFeatures.optionalfeature,
		};
		for (const feature of model.features) {
			const ref = feature.sourceRef;
			const original = dataByType[ref.type].find(record => record.name === ref.name
				&& (ref.type === "race" || record.source === ref.source)
				&& (ref.level === undefined || record.level === ref.level)
				&& (!ref.subclassShortName || record.subclassShortName === ref.subclassShortName));
			expect(original).toBeDefined();
			expect(feature.entries).toEqual(original.entries);
			expect(feature.entries).not.toBe(original.entries);
			expect(feature).not.toHaveProperty("summary");
		}
		model.features[0].entries.push("Changed output only");
		expect(race.entries[0].entries).not.toContain("Changed output only");
	});

	it.each([["Fighter", "Champion", "Improved Critical"], ["Warlock", "Fiend Patron", "Dark One's Blessing"]])("expands the original %s subclass references without rewriting them", (characterClass, containerName, referencedName) => {
		const model = project(example(characterClass));
		const container = model.features.find(feature => feature.name === containerName);
		const classData = sources[characterClass.toLowerCase()];
		const original = classData.subclassFeature.find(feature => feature.name === referencedName && feature.source === "XPHB");
		const expanded = container.displayEntries.find(entry => entry.name === referencedName);
		expect(expanded.entries).toEqual(original.entries);
		expect(model.features.filter(feature => feature.name === referencedName)).toHaveLength(0);
	});

	it.each([["Fighter", "Gnomish Lineage", "Selected lineage", "Forest Gnome"], ["Warlock", "Fiendish Legacy", "Selected legacy", "Infernal"]])("marks the selected %s species option alongside the complete original trait", (characterClass, traitName, label, value) => {
		const model = project(example(characterClass));
		const feature = model.features.find(candidate => candidate.name === traitName);
		expect(feature.selection).toEqual({label, value});
		expect(model.speciesLineage.name).toBe(value);
		const race = sources.races.race.find(record => record.name === model.document.build.species.name && record.source === "XPHB");
		expect(feature.entries).toEqual(race.entries.find(entry => entry.name === traitName).entries);
	});

	it("preserves canonical invocation prerequisite metadata separately from the description", () => {
		const model = project(example("Warlock"));
		const feature = model.features.find(candidate => candidate.name === "Agonizing Blast");
		const original = sources.optionalFeatures.optionalfeature.find(candidate => candidate.name === feature.name && candidate.source === "XPHB");
		expect(feature.prerequisite).toEqual(original.prerequisite);
		expect(feature.prerequisite).not.toBe(original.prerequisite);
		feature.prerequisite[0].level.level = 20;
		expect(original.prerequisite[0].level.level).toBe(2);
	});

	it("does not claim a complete sheet when original feature descriptions are missing", () => {
		const model = createCharacterSheetModel(example(), catalog, {rules, spells: rawSpells});
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual({id: "source-descriptions", message: "Original feature descriptions are unavailable. Reload the source data."});
	});

	it("keeps class hit dice, saves, and level tables aligned with the pinned 5etools records", () => {
		for (const id of ["fighter", "warlock"]) {
			const raw = readJson(`../../../data/class/class-${id}.json`).class.find(record => record.source === "XPHB");
			const reviewed = rules.classes[`${id}|xphb`];
			expect(reviewed.hitDie).toBe(raw.hd.faces);
			expect(reviewed.saveProficiencies).toEqual(raw.proficiency);
			expect(reviewed.skillOptions).toEqual(raw.startingProficiencies.skills[0].choose.from.map(skill => skill.replaceAll(" ", "-")));
			const rows = raw.classTableGroups[0].rows.slice(0, 5);
			const expectedRows = reviewed.levels.map(level => id === "fighter" ? [String(level.secondWind), String(level.masteries)] : [level.invocations, level.cantrips, level.prepared, level.slots, level.slotLevel]);
			expect(expectedRows).toEqual(rows);
		}
	});

	it("calculates Fighter hit dice, saving throws, and Second Wind from the original class record", () => {
		const fighter = structuredClone(sources.fighter);
		const original = fighter.class.find(record => record.name === "Fighter" && record.source === "XPHB");
		original.hd.faces = 12;
		original.proficiency = ["dex", "con"];
		original.classTableGroups[0].rows[4][0] = "4";
		const model = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, fighter}});
		expect(model.status).toBe("complete");
		expect(model.hitDice.die).toBe(12);
		expect(model.abilities.find(ability => ability.id === "str").saveProficient).toBe(false);
		expect(model.abilities.find(ability => ability.id === "dex").saveProficient).toBe(true);
		expect(model.resources.find(resource => resource.name === "Second Wind").maxUses).toBe(4);
	});

	it("calculates Soldier skill proficiencies from the original background record", () => {
		const backgrounds = structuredClone(sources.backgrounds);
		const soldier = backgrounds.background.find(record => record.name === "Soldier" && record.source === "XPHB");
		soldier.skillProficiencies = [{athletics: true, religion: true}];
		const model = createCharacterSheetModel(example(), catalog, {...context, sources: {...sources, backgrounds}});
		expect(model.status).toBe("complete");
		const skills = model.abilities.flatMap(ability => ability.skills);
		expect(skills.find(skill => skill.id === "religion").proficient).toBe(true);
		expect(skills.find(skill => skill.id === "intimidation").proficient).toBe(false);
	});

	it("calculates Warlock Pact Magic slots from the original class progression", () => {
		const warlock = structuredClone(sources.warlock);
		const original = warlock.class.find(record => record.name === "Warlock" && record.source === "XPHB");
		const table = original.classTableGroups.find(group => group.colLabels.includes("Spell Slots"));
		table.rows[4][table.colLabels.indexOf("Spell Slots")] = 3;
		const model = createCharacterSheetModel(example("Warlock"), catalog, {...context, sources: {...sources, warlock}});
		expect(model.status).toBe("complete");
		expect(model.resources.find(resource => resource.name === "Pact Magic").maxUses).toBe(3);
	});

	it("calculates Acolyte skill proficiencies from the original background record", () => {
		const backgrounds = structuredClone(sources.backgrounds);
		const acolyte = backgrounds.background.find(record => record.name === "Acolyte" && record.source === "XPHB");
		acolyte.skillProficiencies = [{insight: true, nature: true}];
		const model = createCharacterSheetModel(example("Warlock"), catalog, {...context, sources: {...sources, backgrounds}});
		expect(model.status).toBe("complete");
		const skills = model.abilities.flatMap(ability => ability.skills);
		expect(skills.find(skill => skill.id === "nature").proficient).toBe(true);
		expect(skills.find(skill => skill.id === "religion").proficient).toBe(false);
	});

	it("keeps the reviewed backgrounds aligned with their ability options, skills, and gold", () => {
		const backgrounds = readJson("../../../data/backgrounds.json").background;
		for (const reviewed of Object.values(rules.backgrounds)) {
			const raw = backgrounds.find(record => record.name === reviewed.name && record.source === "XPHB");
			expect(reviewed.abilities).toEqual(raw.ability[0].choose.weighted.from);
			expect(reviewed.skills).toEqual(Object.keys(raw.skillProficiencies[0]));
			expect(reviewed.gold * 100).toBe(raw.startingEquipment[0].B[0].value);
		}
	});

	it("recalculates imported builds instead of using an example ID or cached statistics", () => {
		const document = example();
		const expected = project(document);
		const imported = parseCharacterDocument(serializeCharacterDocument(document));
		expect(project(imported)).toEqual(expected);
		imported.id = "another-character";
		imported.name = "Another character";
		const renamed = project(imported);
		expect(renamed.hp).toEqual(expected.hp);
		expect(renamed.attacks).toEqual(expected.attacks);
		expect(renamed.abilities).toEqual(expected.abilities);
	});

	it("recalculates all affected statistics when a valid base ability assignment changes", () => {
		const document = example();
		[document.build.abilities.scores.str, document.build.abilities.scores.con] = [document.build.abilities.scores.con, document.build.abilities.scores.str];
		const model = project(document);
		expect(model.status).toBe("complete");
		expect(model.abilities.find(ability => ability.id === "str").score).toBe(17);
		expect(model.abilities.find(ability => ability.id === "con").score).toBe(17);
		expect(model.hp.maximum).toBe(49);
		expect(model.attacks[0].toHit).toBe(6);
		expect(model.attacks[0].damage).toBe("1d8+3 slashing");
	});

	it("applies Constitution increases retroactively to all fixed-average hit points", () => {
		const document = example("Warlock");
		const before = project(document);
		document.build.abilities.method = "manual";
		document.build.abilities.scores.con = 15;
		const after = project(document);
		expect(after.status).toBe("complete");
		expect(after.hp.maximum - before.hp.maximum).toBe(5);
		expect(after.concentration.modifier - before.concentration.modifier).toBe(1);
	});

	it("keeps species, class, and feat casting abilities independent", () => {
		const document = example("Warlock");
		choice(document, "species:tiefling|xphb:spellcasting-ability").selected = ["wis"];
		choice(document, "feat:magic-initiate-cleric|xphb:ability").selected = ["int"];
		const model = project(document);
		expect(model.status).toBe("complete");
		expect(model.spellcasting.map(source => [source.label, source.ability, source.dc])).toEqual([["Species", "wis", 11], ["Warlock", "cha", 15], ["Magic Initiate", "int", 12]]);
		expect(model.spells.find(spell => spell.ref.name === "Hellish Rebuke").sources[0]).toMatchObject({ability: "wis", dc: 11, freeLevel: 1, slotLevel: 3});
		expect(model.spells.find(spell => spell.ref.name === "Healing Word").sources[0]).toMatchObject({ability: "int", dc: 12, freeLevel: 1, slotLevel: 3});
		expect(model.spells.find(spell => spell.ref.name === "Healing Word").metadata.entries).toEqual(rawSpells.spell.find(spell => spell.name === "Healing Word").entries);
	});

	it("suggests the shared fixed class ability before species and feat choices are made", () => {
		const document = example("Warlock");
		choice(document, "species:tiefling|xphb:spellcasting-ability").selected = [];
		choice(document, "feat:magic-initiate-cleric|xphb:ability").selected = [];
		const before = JSON.stringify(document);
		const model = project(document);
		expect(model.status).toBe("incomplete");
		expect(model.spellcastingChoicePlan.commonAbilities).toEqual(["cha"]);
		expect(model.spellcastingChoicePlan.requiresDifferentAbilities).toBe(false);
		expect(model.spellcastingChoicePlan.sources.map(source => source.suggested)).toEqual(["cha", "cha", "cha"]);
		expect(JSON.stringify(document)).toBe(before);
	});

	it("reports but never rewrites imported different spellcasting choices", () => {
		const document = example("Warlock");
		choice(document, "species:tiefling|xphb:spellcasting-ability").selected = ["int"];
		const before = JSON.stringify(document);
		const model = project(document);
		expect(model.status).toBe("complete");
		expect(model.spellcastingChoicePlan).toMatchObject({commonAbilities: ["cha"], requiresDifferentAbilities: false, hasSavedDifferences: true});
		expect(model.spellcastingChoicePlan.sources.find(source => source.id.startsWith("species:")).suggested).toBe("int");
		expect(JSON.stringify(document)).toBe(before);
	});

	it("keeps conditional Concentration advantage separate from the ordinary Constitution save", () => {
		const model = project(example("Warlock"));
		expect(model.concentration).toEqual({modifier: 2, advantage: true});
		expect(model.abilities.find(ability => ability.id === "con")).toMatchObject({save: 2, saveProficient: false, savingThrowAdvantages: [{condition: "to maintain Concentration", feature: "Eldritch Mind"}]});
		expect(model.abilities.find(ability => ability.id === "wis")).toMatchObject({save: 3, saveProficient: true, savingThrowAdvantages: []});
	});

	it("preserves all class, subclass, feat, species, and invocation spell sources", () => {
		const model = project(example("Warlock"));
		expect(model.spells).toHaveLength(23);
		expect(new Set(model.spells.map(spell => spell.id)).size).toBe(23);
		expect(new Set(model.spells.flatMap(spell => spell.sources.map(source => source.kind)))).toEqual(new Set(["class", "subclass", "species", "feat", "invocation"]));
		expect(model.spells.find(spell => spell.ref.name === "Mage Armor").sources[0]).toMatchObject({kind: "invocation", atWill: true, canCastWithSlots: false, freeLevel: 1});
		expect(model.spells.find(spell => spell.ref.name === "Fireball").sources[0]).toMatchObject({kind: "subclass", alwaysPrepared: true, slotLevel: 3});
	});

	it.each([[1, 2], [3, 4], [5, 6]])("distinguishes selected prepared spells from automatic feature grants at level %i", (level, count) => {
		const model = project(example("Warlock", level));
		const selected = model.spells.flatMap(spell => spell.sources).filter(source => source.prepared);
		expect(selected).toHaveLength(count);
		expect(selected.every(source => source.kind === "class" && source.alwaysPrepared === false)).toBe(true);
		expect(model.spells.find(spell => spell.ref.name === "Healing Word").sources[0]).toMatchObject({prepared: false, alwaysPrepared: true});
		if (level >= 3) {
			expect(model.spells.find(spell => spell.ref.name === "Hellish Rebuke").sources[0]).toMatchObject({prepared: false, alwaysPrepared: true});
			expect(model.spells.find(spell => spell.ref.name === "Burning Hands").sources[0]).toMatchObject({prepared: false, alwaysPrepared: true});
		}
		expect(model.features.find(feature => feature.name === "Pact Magic").entries).toEqual(sources.warlock.classFeature.find(feature => feature.name === "Pact Magic" && feature.source === "XPHB").entries);
	});

	it("models Second Wind's partial Short Rest recovery and the distinct Pact resources", () => {
		const fighter = project(example());
		expect(fighter.resources.find(resource => resource.name === "Second Wind")).toMatchObject({maxUses: 3, recovery: {short: 1, long: "all"}, activation: "bonus", healing: {dice: "1d10", modifier: 5}});
		const warlock = project(example("Warlock"));
		expect(warlock.resources.find(resource => resource.name === "Pact Magic")).toMatchObject({id: "class:warlock|xphb:pact-magic", maxUses: 2, slotLevel: 3, recovery: {short: "all", long: "all"}});
		expect(warlock.resources.find(resource => resource.name === "Magical Cunning")).toMatchObject({maxUses: 1, recovery: {long: "all"}});
		expect(warlock.resources.find(resource => resource.name === "Healing Word")).toMatchObject({freeLevel: 1, spellcastingAbility: "cha", healing: {dice: "2d4", modifier: 4}});
		for (const resource of [...fighter.resources, ...warlock.resources]) {
			expect(resource).not.toHaveProperty("detail");
			expect(typeof resource.recovery).toBe("object");
		}
	});

	it("retains session state while deriving maximum resources and hit points", () => {
		const document = example();
		document.session.hp = {current: 23, temporary: 4};
		document.session.resources = [{id: "class:fighter|xphb:second-wind", spent: 2}];
		const model = project(document);
		expect(model.status).toBe("complete");
		expect(model.hp).toEqual({maximum: 49, current: 23, temporary: 4});
		expect(model.resources.find(resource => resource.name === "Second Wind").spent).toBe(2);
	});

	it("does not mutate the document, catalog, raw spells, or reviewed rules", () => {
		const document = example("Warlock");
		const before = JSON.stringify({document, catalog, context});
		const model = project(document);
		model.document.name = "Changed output";
		model.spells[0].metadata.entries[0] = "Changed output metadata";
		model.species.resistances.push("cold");
		expect(JSON.stringify({document, catalog, context})).toBe(before);
	});

	it.each([
		["missing base scores", document => { document.build.abilities.scores = null; }, "ability-scores"],
		["invalid standard array", document => { document.build.abilities.scores.str = 16; }, "ability-scores"],
		["manual score outside the supported cap", document => { document.build.abilities.method = "manual"; document.build.abilities.scores.int = 30; }, "ability-scores"],
		["missing equipment", document => { choice(document, ":equipment").selected = []; }, ":equipment"],
		["missing class skill", document => { choice(document, ":skills").selected.pop(); }, ":skills"],
		["unavailable subclass", document => { choice(document, ":subclass").selected = ["eldritch-knight|xphb"]; }, ":subclass"],
		["unknown decision", document => { document.build.choices.push({id: "class:fighter|xphb:unknown", selected: ["yes"]}); }, ":unknown"],
		["background ability outside its options", document => { choice(document, ":ability-increases").selected = ["cha-2.con-1"]; }, ":ability-increases"],
		["overfull current HP", document => { document.session.hp.current = 999; }, "current-hit-points"],
		["overfull spent resources", document => { document.session.resources.push({id: "class:fighter|xphb:second-wind", spent: 4}); }, ":second-wind"],
		["unknown session resource", document => { document.session.resources.push({id: "unknown", spent: 1}); }, "unknown"],
	])("returns an explicit incomplete result for %s", (label, change, expectedId) => {
		const document = example();
		change(document);
		const model = project(document);
		expect(model.status).toBe("incomplete");
		expect(model.issues.some(issue => issue.id.endsWith(expectedId))).toBe(true);
	});

	it("reports a missing class progression level instead of guessing or crashing", () => {
		const shorterRules = JSON.parse(JSON.stringify(rules));
		shorterRules.classes["fighter|xphb"].levels.pop();
		const model = createCharacterSheetModel(example(), catalog, {...context, rules: shorterRules});
		expect(model.status).toBe("incomplete");
		expect(model.issues).toContainEqual({id: "level", message: "This class level is outside the reviewed sheet coverage."});
	});

	it("rejects an otherwise valid higher-level spell at a lower Pact slot level", () => {
		const document = example("Warlock", 1);
		choice(document, ":prepared-spells").selected[0] = "spell:counterspell|xphb";
		const model = project(document);
		expect(model.status).toBe("incomplete");
		expect(model.issues.find(issue => issue.id === "spell:counterspell|xphb").message).toContain("slot level");
	});

	it("does not grant an invocation's effect without its required selected cantrip", () => {
		const document = example("Warlock");
		choice(document, ":cantrips").selected = ["spell:eldritch-blast|xphb", "spell:mind-sliver|xphb", "spell:mage-hand|xphb"];
		choice(document, ":agonizing-blast-cantrip").selected = ["spell:mage-hand|xphb"];
		expect(project(document).status).toBe("incomplete");
	});

	it("requires new level decisions rather than silently choosing spells at intermediate levels", () => {
		const document = example("Warlock", 3);
		document.build.level = 2;
		document.build.choices = document.build.choices.filter(candidate => !candidate.id.endsWith(":subclass"));
		choice(document, ":prepared-spells").selected = ["spell:armor-of-agathys|xphb", "spell:hex|xphb", "spell:charm-person|xphb"];
		const secondLevel = project(document);
		expect(secondLevel.status).toBe("complete");
		expect(secondLevel.resources.find(resource => resource.name === "Pact Magic")).toMatchObject({maxUses: 2, slotLevel: 1});
		expect(secondLevel.spells.some(spell => spell.ref.name === "Mirror Image")).toBe(false);
		document.build.level = 4;
		expect(project(document).status).toBe("incomplete");
	});

	it("distinguishes missing source metadata from a completed spell reference", () => {
		const model = createCharacterSheetModel(example("Warlock"), catalog, {rules, spells: [], sources});
		expect(model.status).toBe("incomplete");
		expect(model.issues.some(issue => issue.id === "spell:eldritch-blast|xphb")).toBe(true);
		const missingSpells = createCharacterSheetModel(example("Warlock"), catalog, {rules, sources});
		expect(missingSpells.status).toBe("incomplete");
		expect(missingSpells.issues.some(issue => issue.id === "spell:eldritch-blast|xphb")).toBe(true);
		const missingFeats = createCharacterSheetModel(example("Warlock"), catalog, {...context, sources: {...sources, feats: undefined}});
		expect(missingFeats.status).toBe("incomplete");
		expect(missingFeats.issues.some(issue => issue.id === "source-descriptions")).toBe(true);
	});

	it("keeps unsupported classes and incomplete imports compact, without invented statistics", () => {
		const document = example();
		document.build.class = {name: "Wizard", source: "XPHB"};
		const model = project(document);
		expect(model.status).toBe("incomplete");
		expect(model.abilities).toEqual([]);
		expect(model.attacks).toEqual([]);
		expect(model).not.toHaveProperty("hp");
	});

	it("refuses reviewed rules from a different pinned dataset", () => {
		expect(() => createCharacterSheetModel(example(), catalog, {rules: {...rules, dataset: {...rules.dataset, revision: "0".repeat(40)}}, spells: rawSpells})).toThrow("sheetRules.dataset");
	});
});
