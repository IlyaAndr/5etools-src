import {validateCharacterDocument} from "./character-document.js";
import {createSkillCatalog} from "./skill-catalog.js";

export const FIGHTER_ABILITY_SCORE_METHODS = [
	{id: "standard", label: "Standard Array"}, {id: "pointBuy", label: "Point Buy"}, {id: "manual", label: "Manual"},
];

const copy = value => JSON.parse(JSON.stringify(value));
export const getFighterAbilities = sources => createSkillCatalog(sources?.skills, sources?.abilityNames).map(({id, name}) => ({id, label: name}));
const option = (id, label) => ({id, label});

/** Read the reviewed Fighter and Soldier choices from their original records. */
export function getFighterSourceChoices (sources) {
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityIds = new Set(abilities.map(ability => ability.id));
	const skillIds = new Set(abilities.flatMap(ability => ability.skills).map(skill => skill.id));
	const record = (records, name) => {
		const matches = Array.isArray(records) ? records.filter(entry => entry.name === name && entry.source === "XPHB") : [];
		if (matches.length !== 1) throw new TypeError(`Missing or ambiguous XPHB ${name} source record.`);
		return matches[0];
	};
	const fighter = record(sources?.fighter?.class, "Fighter");
	const soldier = record(sources?.backgrounds?.background, "Soldier");
	const skillId = name => {
		if (typeof name !== "string") throw new TypeError("Invalid skill in Fighter or Soldier source.");
		const id = name.toLowerCase().replaceAll(" ", "-");
		if (!skillIds.has(id)) throw new TypeError(`Missing skill ${id} in the skills catalog.`);
		return id;
	};
	const classSkillEntries = fighter.startingProficiencies?.skills;
	if (!Array.isArray(classSkillEntries) || classSkillEntries.length !== 1 || Object.keys(classSkillEntries[0]).join() !== "choose") throw new TypeError("Unsupported Fighter skill proficiency source.");
	const classChoice = classSkillEntries[0].choose;
	if (!classChoice || Object.keys(classChoice).sort().join() !== "count,from" || !Array.isArray(classChoice.from) || !Number.isInteger(classChoice.count) || classChoice.count < 1) throw new TypeError("Unsupported Fighter skill choice source.");
	const classSkills = classChoice.from.map(skillId);
	if (new Set(classSkills).size !== classSkills.length || classChoice.count > classSkills.length) throw new TypeError("Invalid Fighter skill choice source.");
	const backgroundEntries = soldier.skillProficiencies;
	if (!Array.isArray(backgroundEntries) || backgroundEntries.length !== 1 || !backgroundEntries[0] || typeof backgroundEntries[0] !== "object" || Array.isArray(backgroundEntries[0]) || !Object.keys(backgroundEntries[0]).length || Object.values(backgroundEntries[0]).some(value => value !== true)) throw new TypeError("Unsupported Soldier skill proficiency source.");
	const backgroundSkills = Object.keys(backgroundEntries[0]).map(skillId);
	if (new Set(backgroundSkills).size !== backgroundSkills.length) throw new TypeError("Duplicate Soldier skill proficiency.");
	if (!Array.isArray(soldier.ability) || !soldier.ability.length) throw new TypeError("Unsupported Soldier ability choice source.");
	const backgroundWeights = soldier.ability.map(entry => {
		if (!entry || Object.keys(entry).join() !== "choose" || !entry.choose || Object.keys(entry.choose).join() !== "weighted") throw new TypeError("Unsupported Soldier ability choice source.");
		const weighted = entry.choose.weighted;
		if (!weighted || Object.keys(weighted).sort().join() !== "from,weights" || !Array.isArray(weighted.from) || !Array.isArray(weighted.weights) || !weighted.from.length || new Set(weighted.from).size !== weighted.from.length || weighted.from.some(id => !abilityIds.has(id)) || weighted.weights.length > weighted.from.length || ![[2, 1], [1, 1, 1]].some(weights => weights.join() === weighted.weights.join())) throw new TypeError("Unsupported Soldier ability choice source.");
		return weighted;
	});
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
	return {classSkills, classSkillCount: classChoice.count, backgroundSkills, backgroundAbilityIds: [...new Set(backgroundWeights.flatMap(weighted => weighted.from))], backgroundWeights, masteries, secondWind};
}

/** Create an empty build within the first reviewed editor's fixed scope. */
export function createFighterDraft (dataset, {getRandomValues = bytes => globalThis.crypto.getRandomValues(bytes)} = {}) {
	// getRandomValues is available on non-secure HTTP origins, unlike randomUUID.
	const bytes = getRandomValues(new Uint8Array(16));
	if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new TypeError("Character ID generator must return 16 random bytes.");
	const id = `character-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
	const document = {
		schemaVersion: 1,
		id,
		name: "New Character",
		status: "draft",
		ruleset: "2024",
		dataset: copy(dataset),
		build: {
			level: 1,
			class: {name: "Fighter", source: "XPHB"},
			species: {name: "Gnome", source: "XPHB"},
			background: {name: "Soldier", source: "XPHB"},
			abilities: {method: "standard", scores: null},
			choices: [],
		},
		session: {hp: {current: null, temporary: 0}, resources: [], notes: ""},
	};
	validateCharacterDocument(document);
	return document;
}

/** The editor does not replace or convert builds outside its reviewed scope. */
export function isSupportedFighterDocument (document) {
	const {build} = document || {};
	return build?.class?.name === "Fighter" && build.class.source === "XPHB"
		&& build.species?.name === "Gnome" && build.species.source === "XPHB"
		&& build.background?.name === "Soldier" && build.background.source === "XPHB";
}

function increaseOptions (allowed, backgroundWeights, abilityName, selected = []) {
	const result = [];
	if (backgroundWeights) {
		const seen = new Set();
		for (const {from, weights} of backgroundWeights) {
			const add = (chosen = []) => {
				if (chosen.length < weights.length) {
					for (const id of from) if (!chosen.includes(id)) add([...chosen, id]);
					return;
				}
				const parts = chosen.map((id, index) => `${id}-${weights[index]}`);
				const key = [...parts].sort().join(".");
				if (seen.has(key)) return;
				seen.add(key);
				result.push(option(parts.join("."), chosen.map((id, index) => `${abilityName(id)} +${weights[index]}`).join(", ")));
			};
			add();
		}
	} else {
		for (const first of allowed) {
			result.push(option(`${first}-2`, `${abilityName(first)} +2`));
			for (const second of allowed.slice(allowed.indexOf(first) + 1)) result.push(option(`${first}-1.${second}-1`, `${abilityName(first)} +1, ${abilityName(second)} +1`));
		}
	}
	// Existing documents may use a different order for equivalent increases.
	// Keep the saved identifier visible without rewriting the underlying choice.
	const normalized = value => value.split(".").sort().join(".");
	for (const value of selected) {
		if (result.some(entry => entry.id === value)) continue;
		const equivalent = result.find(entry => normalized(entry.id) === normalized(value));
		if (equivalent) result.push(option(value, equivalent.label));
	}
	return result;
}

/**
 * Return reviewed choice options and current selections. Locked choices stay
 * visible when lowering level; the caller may explicitly clear them.
 * The sheet model remains the final authority for build legality.
 */
export function getFighterChoiceDescriptors (document, catalog, {rules, sources} = {}) {
	validateCharacterDocument(document);
	if (!isSupportedFighterDocument(document)) return [];
	const species = catalog.species.find(entry => entry.ref.name === "Gnome" && entry.ref.source === "XPHB");
	const fighter = rules?.classes?.["fighter|xphb"];
	const soldier = rules?.backgrounds?.["soldier|xphb"];
	if (!species || !fighter || !soldier || !rules?.standardLanguages || !rules?.equipment || !rules?.weapons) throw new TypeError("Missing reviewed Fighter editor data.");
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const sourceChoices = getFighterSourceChoices(sources);
	const skills = new Map(abilities.flatMap(ability => ability.skills).map(skill => [skill.id, skill.name]));
	const abilityName = id => abilities.find(ability => ability.id === id)?.name || id;
	const choices = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	const level = document.build.level;
	const descriptor = (id, label, count, options, minimumLevel = 1) => ({
		id, label, count, options, selected: [...(choices.get(id) || [])], available: level >= minimumLevel, minimumLevel,
	});
	const selectedLineage = species.lineages.find(lineage => lineage.id === choices.get(species.lineageChoiceId)?.[0]);
	const abilityOptions = selectedLineage?.abilityOptions || [...new Set(species.lineages.flatMap(lineage => lineage.abilityOptions))];
	const equipmentOptions = Object.entries(rules.equipment).filter(([, value]) => value.classId === "fighter|xphb" && value.backgroundId === "soldier|xphb")
		.map(([id, value]) => option(id, value.gear.join(", ")));
	const masteryOptions = Object.entries(rules.weapons).map(([id, weapon]) => option(id, `${weapon.name} (${weapon.mastery})`));
	return [
		descriptor(species.lineageChoiceId, "Gnomish Lineage", 1, species.lineages.map(lineage => option(lineage.id, lineage.name))),
		descriptor(species.abilityChoiceId, "Species Spellcasting Ability", 1, abilityOptions.map(id => option(id, abilityName(id)))),
		descriptor("background:soldier|xphb:ability-increases", "Background Ability Increases", 1, increaseOptions(sourceChoices.backgroundAbilityIds, sourceChoices.backgroundWeights, abilityName, choices.get("background:soldier|xphb:ability-increases"))),
		descriptor("background:soldier|xphb:tool", "Background Tool", 1, Object.entries(soldier.toolOptions).map(([id, label]) => option(id, label))),
		descriptor("character:languages", "Languages (include Common)", 3, Object.entries(rules.standardLanguages).map(([id, label]) => option(id, label))),
		descriptor("class:fighter|xphb:skills", "Fighter Skills", sourceChoices.classSkillCount, sourceChoices.classSkills.filter(id => !sourceChoices.backgroundSkills.includes(id)).map(id => {
			if (!skills.has(id)) throw new TypeError(`Missing skill ${id} in the skills catalog.`);
			return option(id, skills.get(id));
		})),
		descriptor("class:fighter|xphb:equipment", "Starting Equipment", 1, equipmentOptions),
		descriptor("class:fighter|xphb:fighting-style", "Fighting Style", 1, [option("defense|xphb", "Defense")]),
		descriptor("class:fighter|xphb:weapon-masteries", "Weapon Masteries", sourceChoices.masteries(level), masteryOptions),
		descriptor("class:fighter|xphb:subclass", "Subclass", 1, [option(fighter.subclass.id, fighter.subclass.name)], 3),
		descriptor("class:fighter|xphb:level-4-feat", "Level 4 Feat", 1, [option("ability-score-improvement|xphb", "Ability Score Improvement")], 4),
		descriptor("class:fighter|xphb:level-4-ability-increases", "Level 4 Ability Increases", 1, increaseOptions(abilities.map(ability => ability.id), false, abilityName, choices.get("class:fighter|xphb:level-4-ability-increases")), 4),
	];
}

/** Save an explicit edit without altering any other decision or session value. */
export function setFighterChoice (document, id, selected) {
	validateCharacterDocument(document);
	const next = copy(document);
	const index = next.build.choices.findIndex(choice => choice.id === id);
	if (!selected.length) {
		if (index !== -1) next.build.choices.splice(index, 1);
	} else if (index === -1) next.build.choices.push({id, selected: [...selected]});
	else next.build.choices[index].selected = [...selected];
	validateCharacterDocument(next);
	return next;
}
