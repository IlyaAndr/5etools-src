import {validateCharacterDocument} from "./character-document.js";
import {composeChoiceDescriptors} from "./compose-choices.js";
import {findClassRecord, getIncreaseOptions, getSpellOptions, option} from "./choice-common.js";
import {createCharacterDraft, getEditorAbilities} from "./editor-common.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getClassSkillChoices, getSourceRecord} from "./source-choices.js";
import {getSpellQueryOptions, resolveSpellCatalog} from "./spell-catalog.js";

/** The filter expressions the reviewed class table applies to its spell columns. */
const SPELL_LIST_LABELS = Object.freeze({
	cantrips: "{@filter Cantrips|spells|level=0|class=Warlock}",
	prepared: "{@filter Prepared Spells|spells|level=!0|class=Warlock}",
});
const PROGRESSION_LABELS = Object.freeze([
	"{@filter Invocations|optionalfeatures|feature type=ei}",
	SPELL_LIST_LABELS.cantrips,
	SPELL_LIST_LABELS.prepared,
	"Spell Slots",
	"Slot Level",
]);

/**
 * Read the filter expression a progression-table column applies to spells, so
 * the reviewed list comes from the source record instead of a copied list.
 */
function spellQuery (label) {
	const match = /^\{@filter [^|]+\|spells\|(.+)\}$/.exec(label);
	if (!match) throw new TypeError("Unsupported Warlock spell list filter.");
	return match[1];
}

/** Locate the reviewed progression table and the spell filters its columns use. */
function readProgressionTable (warlock) {
	const groups = (warlock.classTableGroups || []).filter(group => Array.isArray(group.colLabels) && PROGRESSION_LABELS.every(label => group.colLabels.filter(value => value === label).length === 1));
	if (groups.length !== 1 || !Array.isArray(groups[0].rows) || groups[0].rows.length !== 20) throw new TypeError("Unsupported Warlock progression table.");
	const table = groups[0];
	const columns = PROGRESSION_LABELS.map(label => table.colLabels.indexOf(label));
	if (table.rows.some(row => !Array.isArray(row) || row.length !== table.colLabels.length || columns.some(column => !Number.isSafeInteger(row[column]) || row[column] < 1))) throw new TypeError("Unsupported Warlock progression table.");
	return {
		table,
		columns,
		spellQueries: {cantrips: spellQuery(SPELL_LIST_LABELS.cantrips), prepared: spellQuery(SPELL_LIST_LABELS.prepared)},
	};
}

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

/** Read Warlock class choices, spells, and progression from its original record. */
export function getWarlockSourceChoices (sources) {
	const warlock = getSourceRecord(sources?.warlock?.class, {name: "Warlock", source: "XPHB"});
	if (warlock.spellcastingAbility !== "cha") throw new TypeError("Unsupported Warlock spellcasting ability.");
	const {classSkills, classSkillCount} = getClassSkillChoices(sources, warlock);
	const {table, columns, spellQueries} = readProgressionTable(warlock);
	const progression = level => {
		if (!Number.isInteger(level) || level < 1 || level > table.rows.length) throw new TypeError("Missing Warlock progression for level.");
		return Object.fromEntries(["invocations", "cantrips", "prepared", "slots", "slotLevel"].map((key, index) => [key, table.rows[level - 1][columns[index]]]));
	};
	return {classSkills, classSkillCount, progression, spellQueries};
}

/** Read the spell-list filters the Warlock table applies, without other class data. */
export function getWarlockSpellQueries (sources) {
	const warlock = getSourceRecord(sources?.warlock?.class, {name: "Warlock", source: "XPHB"});
	return readProgressionTable(warlock).spellQueries;
}

/** The reviewed 2024 patrons, read from the class source records. */
const SUBCLASS_NAMES = ["Archfey", "Celestial", "Fiend", "Great Old One"];
const slugName = value => value.toLowerCase().replaceAll(" ", "-");

/** List every reviewed patron with the original source record behind it. */
export function getWarlockSubclasses (sources) {
	const records = (sources?.warlock?.subclass || []).filter(record => record.className === "Warlock"
		&& record.classSource === "XPHB" && record.source === "XPHB" && SUBCLASS_NAMES.includes(record.shortName));
	if (records.length !== SUBCLASS_NAMES.length || new Set(records.map(record => record.shortName)).size !== SUBCLASS_NAMES.length) {
		throw new TypeError("Missing or ambiguous XPHB Warlock subclass records.");
	}
	return SUBCLASS_NAMES.map(name => {
		const record = records.find(candidate => candidate.shortName === name);
		return {id: `${slugName(name)}|xphb`, name, record};
	});
}

/** Resolve one subclass spell reference against the reviewed spell catalog. */
function subclassSpellId (uid, spellCatalog) {
	const clean = `${uid}`.split("#")[0];
	const [name, source] = clean.split("|");
	if (!name || !source) throw new TypeError(`Unsupported subclass spell reference ${uid}.`);
	const id = `spell:${slugName(name.trim())}|${source.trim().toLowerCase()}`;
	const spell = spellCatalog?.byId?.get(id);
	if (!spell) throw new TypeError(`Unknown subclass spell ${uid}.`);
	return {id, level: spell.level};
}

/**
 * Read the expanded spell list a patron grants straight from its source record.
 * `prepared` becomes the always-prepared list; the Celestial's cantrips come
 * from `known`. Innate free-cast grants need their own resource annotation and
 * stay unsupported until that resource is reviewed.
 */
export function getSubclassSpellGrants (subclass, spellCatalog) {
	if (!subclass?.record) throw new TypeError("Missing reviewed subclass record.");
	if (!spellCatalog?.byId) throw new TypeError("Subclass spells require the spell catalog.");
	const block = (subclass.record.additionalSpells || [])[0] || {};
	for (const key of Object.keys(block)) if (!["known", "prepared", "innate"].includes(key)) throw new TypeError(`Unsupported ${subclass.name} spell block ${key}.`);
	const known = [];
	const prepared = [];
	if (block.known !== undefined) {
		if (!block.known || typeof block.known !== "object" || Array.isArray(block.known)) throw new TypeError(`Unsupported ${subclass.name} known spells.`);
		for (const [level, list] of Object.entries(block.known)) {
			if (!/^[1-9][0-9]*$/.test(level) || !Array.isArray(list)) throw new TypeError(`Unsupported ${subclass.name} known spells.`);
			for (const uid of list) {
				const spell = subclassSpellId(uid, spellCatalog);
				if (spell.level !== 0 || known.includes(spell.id)) throw new TypeError(`Unsupported ${subclass.name} known spell ${uid}.`);
				known.push(spell.id);
			}
		}
	}
	if (block.prepared !== undefined) {
		if (!block.prepared || typeof block.prepared !== "object" || Array.isArray(block.prepared)) throw new TypeError(`Unsupported ${subclass.name} prepared spells.`);
		for (const [level, list] of Object.entries(block.prepared)) {
			if (!/^[3-9]$/.test(level) || !Array.isArray(list)) throw new TypeError(`Unsupported ${subclass.name} prepared spells.`);
			prepared.push({minimumLevel: Number(level), spells: list.map(uid => subclassSpellId(uid, spellCatalog).id)});
		}
	}
	return {known, prepared: prepared.sort((left, right) => left.minimumLevel - right.minimumLevel)};
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
export function getWarlockClassChoiceDescriptors (document, {rules, sources, spells, spellCatalog: preparedSpellCatalog} = {}) {
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
	const spellCatalog = resolveSpellCatalog({spellCatalog: preparedSpellCatalog, spells: rawSpells, sources});
	if (!spellCatalog) throw new TypeError("Missing spell list data.");
	const cantripOptions = getSpellQueryOptions(spellCatalog, sourceChoices.spellQueries.cantrips);
	const preparedOptions = getSpellQueryOptions(spellCatalog, sourceChoices.spellQueries.prepared).filter(entry => entry.spell.level <= progression.slotLevel);
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
		descriptor(`${owner}:cantrips`, "Warlock Cantrips", progression.cantrips, cantripOptions),
		descriptor(`${owner}:prepared-spells`, "Prepared Warlock Spells", progression.prepared, preparedOptions),
		invocationDescriptor,
	];
	/**
	 * An invocation's own cantrip or weapon choice exists only while that
	 * invocation is selected, so the descriptor names its prerequisite and the
	 * editor drops a saved selection when the invocation is deselected.
	 */
	const invocationChoice = (id, choiceId, label, options, minimumLevel) => ({
		...descriptor(`${owner}:${choiceId}`, label, 1, options, minimumLevel, invocationChoices.includes(id)),
		dependsOn: {choice: `${owner}:invocations`, option: id},
	});
	for (const [id, value] of Object.entries(rules.invocations).filter(([, value]) => value.cantripChoice)) {
		const knownCantrips = decisions.get(`${owner}:cantrips`) || [];
		const options = getSpellOptions(rawSpells, value.cantripOptions.filter(spell => knownCantrips.includes(spell)));
		const choice = invocationChoice(id, value.cantripChoice, `${value.name} Cantrip`, options, value.minimumLevel);
		// The invocation only affects reviewed cantrips the character already knows,
		// so name them instead of presenting an empty picker.
		if (!options.length) choice.help = `${value.name} affects ${value.cantripOptions.map(spellId => spellCatalog.byId.get(spellId)?.name || spellId).join(" or ")}, which is not one of your Warlock cantrips yet.`;
		result.push(choice);
	}
	for (const [id, value] of Object.entries(rules.invocations).filter(([, value]) => value.weaponChoice)) {
		const options = value.weaponOptions.map(weaponId => option(weaponId, rules.pactWeapons[weaponId].name));
		result.push(invocationChoice(id, value.weaponChoice, "Pact Weapon", options, value.minimumLevel));
	}
	result.push(
		descriptor(`${owner}:subclass`, "Subclass", 1, warlock.subclasses.map(value => option(value.id, value.name)), 3),
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
