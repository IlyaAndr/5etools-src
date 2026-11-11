import {validateCharacterDocument} from "./character-document.js";
import {composeChoiceDescriptors} from "./compose-choices.js";
import {createSpellOptionReader, findClassRecord, getIncreaseOptions, getSpellOptions, option, spellOption} from "./choice-common.js";
import {createCharacterDraft, getEditorAbilities} from "./editor-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getClassSkillChoices, getSourceRecord} from "./source-choices.js";

/**
 * Reviewed invocations the character may take: the level must reach the
 * annotated minimum, and every prerequisite invocation must already be
 * selected. Annotations whose choice this subset cannot express stay out of the
 * list so the sheet reports them instead of silently ignoring them.
 */
export function getAvailableInvocations (rules, level, selected = []) {
	const chosen = new Set(selected);
	return Object.entries(rules?.invocations || {}).filter(([, value]) => !value.unsupported
		&& value.minimumLevel <= level
		&& (value.requires || []).every(id => chosen.has(id)));
}

/** Read Warlock class choices and progression from its original record. */
export function getWarlockSourceChoices (sources) {
	const warlock = getSourceRecord(sources?.warlock?.class, {name: "Warlock", source: "XPHB"});
	if (warlock.spellcastingAbility !== "cha") throw new TypeError("Unsupported Warlock spellcasting ability.");
	const {classSkills, classSkillCount} = getClassSkillChoices(sources, warlock);
	const labels = ["{@filter Invocations|optionalfeatures|feature type=ei}", "{@filter Cantrips|spells|level=0|class=Warlock}", "{@filter Prepared Spells|spells|level=!0|class=Warlock}", "Spell Slots", "Slot Level"];
	const groups = (warlock.classTableGroups || []).filter(group => Array.isArray(group.colLabels) && labels.every(label => group.colLabels.filter(value => value === label).length === 1));
	if (groups.length !== 1 || !Array.isArray(groups[0].rows) || groups[0].rows.length !== 20) throw new TypeError("Unsupported Warlock progression table.");
	const table = groups[0];
	const columns = labels.map(label => table.colLabels.indexOf(label));
	if (table.rows.some(row => !Array.isArray(row) || row.length !== table.colLabels.length || columns.some(column => !Number.isSafeInteger(row[column]) || row[column] < 1))) throw new TypeError("Unsupported Warlock progression table.");
	const progression = level => {
		if (!Number.isInteger(level) || level < 1 || level > table.rows.length) throw new TypeError("Missing Warlock progression for level.");
		return Object.fromEntries(["invocations", "cantrips", "prepared", "slots", "slotLevel"].map((key, index) => [key, table.rows[level - 1][columns[index]]]));
	};
	return {classSkills, classSkillCount, progression};
}

/** Create an empty Warlock build with the shared spellcasting ability selected. */
export function createWarlockDraft (dataset, options) {
	const document = createCharacterDraft(dataset, {
		characterClass: {name: "Warlock", source: "XPHB"},
		species: {name: "Tiefling", source: "XPHB"},
		background: {name: "Acolyte", source: "XPHB"},
	}, options);
	document.build.choices = [
		{id: "species:tiefling|xphb:spellcasting-ability", selected: ["cha"]},
		{id: "feat:magic-initiate-cleric|xphb:ability", selected: ["cha"]},
	];
	validateCharacterDocument(document);
	return document;
}

export function isSupportedWarlockDocument (document) {
	const {build} = document || {};
	return build?.class?.name === "Warlock" && build.class.source === "XPHB"
		&& build.species?.name === "Tiefling" && build.species.source === "XPHB"
		&& build.background?.name === "Acolyte" && build.background.source === "XPHB";
}

/**
 * Contribute Warlock-owned choices independently of the character's species,
 * background, or origin feat. Equipment is a separate choice provider.
 */
export function getWarlockClassChoiceDescriptors (document, {rules, sources, spells} = {}) {
	validateCharacterDocument(document);
	if (document.build.class.name !== "Warlock" || document.build.class.source !== "XPHB") return [];
	const warlock = rules?.classes?.["warlock|xphb"];
	if (!warlock || !rules?.invocations) throw new TypeError("Missing reviewed Warlock class choices.");
	const sourceChoices = getWarlockSourceChoices(sources);
	const progression = sourceChoices.progression(document.build.level);
	const abilities = getEditorAbilities(sources);
	const abilityName = id => abilities.find(ability => ability.id === id)?.label || id;
	const skillNames = new Map(createSkillCatalog(sources?.skills, sources?.abilityNames).flatMap(ability => ability.skills).map(skill => [skill.id, skill.name]));
	const decisions = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	const descriptor = (id, label, count, options, minimumLevel = 1, available = true) => ({
		id, label, count, options, selected: [...(decisions.get(id) || [])], available: document.build.level >= minimumLevel && available, minimumLevel,
	});
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	const readSpell = createSpellOptionReader(rawSpells);
	const preparedOptions = warlock.preparedOptions.map(readSpell).filter(spell => spell.level === null || spell.level <= progression.slotLevel).map(spell => spellOption(spell));
	const owner = "class:warlock|xphb";
	const invocationChoices = decisions.get(`${owner}:invocations`) || [];
	const invocations = getAvailableInvocations(rules, document.build.level, invocationChoices).map(([id, value]) => option(id, value.name));
	const levelFourAbilities = abilities.map(ability => ability.id);
	const levelFourWeights = [{from: levelFourAbilities, weights: [2]}, {from: levelFourAbilities, weights: [1, 1]}];
	const invocationDescriptor = descriptor(`${owner}:invocations`, "Eldritch Invocations", progression.invocations, invocations);
	const unsupportedInvocations = Object.values(rules.invocations).filter(value => value.unsupported);
	if (unsupportedInvocations.length) {
		invocationDescriptor.help = `Not offered yet because their choices are not reviewed: ${unsupportedInvocations.map(value => `${value.name}: ${value.unsupported}`).join(" ")}`;
	}
	const result = [
		descriptor(`${owner}:skills`, "Warlock Skills", sourceChoices.classSkillCount, sourceChoices.classSkills.map(id => option(id, skillNames.get(id)))),
		descriptor(`${owner}:cantrips`, "Warlock Cantrips", progression.cantrips, getSpellOptions(rawSpells, warlock.cantripOptions)),
		descriptor(`${owner}:prepared-spells`, "Prepared Warlock Spells", progression.prepared, preparedOptions),
		invocationDescriptor,
	];
	for (const [id, value] of Object.entries(rules.invocations).filter(([, value]) => value.cantripChoice)) {
		const options = value.cantripOptions.filter(spell => (decisions.get(`${owner}:cantrips`) || []).includes(spell));
		result.push(descriptor(`${owner}:${value.cantripChoice}`, `${value.name} Cantrip`, 1, getSpellOptions(rawSpells, options), value.minimumLevel, invocationChoices.includes(id)));
	}
	result.push(
		descriptor(`${owner}:subclass`, "Subclass", 1, [option(warlock.subclass.id, warlock.subclass.name)], 3),
		descriptor(`${owner}:level-4-feat`, "Level 4 Feat", 1, [option("ability-score-improvement|xphb", "Ability Score Improvement")], 4),
		descriptor(`${owner}:level-4-ability-increases`, "Level 4 Ability Increases", 1, getIncreaseOptions(levelFourAbilities, levelFourWeights, abilityName, decisions.get(`${owner}:level-4-ability-increases`)), 4),
	);
	return result;
}

/**
 * Return reviewed choice options for the Tiefling / Acolyte / Warlock preset.
 * The sheet model remains the final authority for build legality.
 */
export function getWarlockChoiceDescriptors (document, catalog, context = {}) {
	validateCharacterDocument(document);
	if (!isSupportedWarlockDocument(document)) return [];
	const warlock = findClassRecord(context.sources, "warlock", document.build.class);
	return composeChoiceDescriptors(document, catalog, context, {
		classDescriptors: getWarlockClassChoiceDescriptors(document, context),
		spellcastingAbility: warlock?.spellcastingAbility || null,
	});
}
