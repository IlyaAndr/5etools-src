import {validateCharacterDocument} from "./character-document.js";
import {composeChoiceDescriptors} from "./compose-choices.js";
import {findClassRecord, getIncreaseOptions, option} from "./choice-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getClassSkillChoices, getSourceRecord} from "./source-choices.js";
import {createCharacterDraft} from "./editor-common.js";

/** Read Fighter class choices and progression from its original record. */
export function getFighterSourceChoices (sources) {
	const fighter = getSourceRecord(sources?.fighter?.class, {name: "Fighter", source: "XPHB"});
	const {classSkills, classSkillCount} = getClassSkillChoices(sources, fighter);
	const progression = fighter.itemMasteriesProgression;
	if (!progression || typeof progression !== "object" || Array.isArray(progression) || !Object.keys(progression).length || Object.entries(progression).some(([level, count]) => !/^[1-9]\d*$/.test(level) || !Number.isInteger(count) || count < 1)) throw new TypeError("Unsupported Fighter mastery progression source.");
	const masteries = level => {
		const thresholds = Object.keys(progression).map(Number).filter(threshold => threshold <= level);
		if (!thresholds.length) throw new TypeError("Missing Fighter mastery progression for level.");
		return progression[Math.max(...thresholds)];
	};
	const tableGroups = fighter.classTableGroups;
	if (!Array.isArray(tableGroups)) throw new TypeError("Missing Fighter Second Wind table.");
	const matchingGroups = tableGroups.filter(group => Array.isArray(group?.colLabels) && group.colLabels.includes("Second Wind"));
	if (matchingGroups.length !== 1) throw new TypeError("Missing or ambiguous Fighter Second Wind table.");
	const table = matchingGroups[0];
	const column = table.colLabels.indexOf("Second Wind");
	if (table.colLabels.lastIndexOf("Second Wind") !== column || !Array.isArray(table.rows) || table.rows.length !== 20 || table.rows.some(row => !Array.isArray(row) || row.length !== table.colLabels.length || typeof row[column] !== "string" || !/^[1-9]\d*$/.test(row[column]))) throw new TypeError("Unsupported Fighter Second Wind table.");
	const secondWind = level => {
		if (!Number.isInteger(level) || level < 1 || level > table.rows.length) throw new TypeError("Missing Fighter Second Wind uses for level.");
		return Number(table.rows[level - 1][column]);
	};
	return {classSkills, classSkillCount, masteries, secondWind};
}

/** Create an empty build within the first reviewed editor's fixed scope. */
export function createFighterDraft (dataset, options) {
	return createCharacterDraft(dataset, {
		characterClass: {name: "Fighter", source: "XPHB"},
		species: {name: "Gnome", source: "XPHB"},
		background: {name: "Soldier", source: "XPHB"},
	}, options);
}

/** The editor does not replace or convert builds outside its reviewed scope. */
export function isSupportedFighterDocument (document) {
	const {build} = document || {};
	return build?.class?.name === "Fighter" && build.class.source === "XPHB"
		&& build.species?.name === "Gnome" && build.species.source === "XPHB"
		&& build.background?.name === "Soldier" && build.background.source === "XPHB";
}

/**
 * Contribute Fighter-owned choices independently of the character's species or
 * background. Equipment packages and skill-proficiency conflicts are resolved
 * by the composition layer, since they depend on other selected sources.
 */
export function getFighterClassChoiceDescriptors (document, {rules, sources} = {}) {
	validateCharacterDocument(document);
	if (document.build.class.name !== "Fighter" || document.build.class.source !== "XPHB") return [];
	const fighter = rules?.classes?.["fighter|xphb"];
	if (!fighter || !rules?.weapons) throw new TypeError("Missing reviewed Fighter class choices.");
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const sourceChoices = getFighterSourceChoices(sources);
	const skills = new Map(abilities.flatMap(ability => ability.skills).map(skill => [skill.id, skill.name]));
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const choices = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	const level = document.build.level;
	const descriptor = (id, label, count, options, minimumLevel = 1) => ({
		id, label, count, options, selected: [...(choices.get(id) || [])], available: level >= minimumLevel, minimumLevel,
	});
	const masteryOptions = Object.entries(rules.weapons).map(([id, weapon]) => option(id, `${weapon.name} (${weapon.mastery})`));
	return [
		descriptor("class:fighter|xphb:skills", "Fighter Skills", sourceChoices.classSkillCount, sourceChoices.classSkills.map(id => {
			if (!skills.has(id)) throw new TypeError(`Missing skill ${id} in the skills catalog.`);
			return option(id, skills.get(id));
		})),
		descriptor("class:fighter|xphb:fighting-style", "Fighting Style", 1, [option("defense|xphb", "Defense")]),
		descriptor("class:fighter|xphb:weapon-masteries", "Weapon Masteries", sourceChoices.masteries(level), masteryOptions),
		descriptor("class:fighter|xphb:subclass", "Subclass", 1, [option(fighter.subclass.id, fighter.subclass.name)], 3),
		descriptor("class:fighter|xphb:level-4-feat", "Level 4 Feat", 1, [option("ability-score-improvement|xphb", "Ability Score Improvement")], 4),
		descriptor("class:fighter|xphb:level-4-ability-increases", "Level 4 Ability Increases", 1, getIncreaseOptions(abilities.map(ability => ability.id), false, abilityName, choices.get("class:fighter|xphb:level-4-ability-increases")), 4),
	];
}

/**
 * Return reviewed choice options and current selections for the Gnome /
 * Soldier / Fighter reference preset. Locked choices stay visible when lowering
 * level; the caller may explicitly clear them. The sheet model remains the
 * final authority for build legality.
 */
export function getFighterChoiceDescriptors (document, catalog, context = {}) {
	validateCharacterDocument(document);
	if (!isSupportedFighterDocument(document)) return [];
	const fighter = findClassRecord(context.sources, "fighter", document.build.class);
	return composeChoiceDescriptors(document, catalog, context, {
		classDescriptors: getFighterClassChoiceDescriptors(document, context),
		spellcastingAbility: fighter?.spellcastingAbility || null,
	});
}
