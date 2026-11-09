import {validateCharacterDocument} from "./character-document.js";
import {createFighterDraft, getFighterAbilities} from "./fighter-choices.js";
import {createSkillCatalog} from "./skill-catalog.js";

const option = (id, label) => ({id, label});
const slug = value => value.toLowerCase().replaceAll(" ", "-");

/** Read supported Warlock/Acolyte choices and progression from 5etools. */
export function getWarlockSourceChoices (sources) {
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityIds = new Set(abilities.map(ability => ability.id));
	const skillIds = new Set(abilities.flatMap(ability => ability.skills).map(skill => skill.id));
	const record = (records, name) => {
		const matches = Array.isArray(records) ? records.filter(entry => entry.name === name && entry.source === "XPHB") : [];
		if (matches.length !== 1) throw new TypeError(`Missing or ambiguous XPHB ${name} source record.`);
		return matches[0];
	};
	const warlock = record(sources?.warlock?.class, "Warlock");
	const acolyte = record(sources?.backgrounds?.background, "Acolyte");
	if (warlock.spellcastingAbility !== "cha") throw new TypeError("Unsupported Warlock spellcasting ability.");
	const skillId = name => {
		if (typeof name !== "string") throw new TypeError("Invalid skill in Warlock or Acolyte source.");
		const id = slug(name);
		if (!skillIds.has(id)) throw new TypeError(`Missing skill ${id} in the skills catalog.`);
		return id;
	};
	const entries = warlock.startingProficiencies?.skills;
	if (!Array.isArray(entries) || entries.length !== 1 || Object.keys(entries[0]).join() !== "choose") throw new TypeError("Unsupported Warlock skill proficiency source.");
	const choice = entries[0].choose;
	if (!choice || Object.keys(choice).sort().join() !== "count,from" || !Array.isArray(choice.from) || !Number.isInteger(choice.count) || choice.count < 1) throw new TypeError("Unsupported Warlock skill choice source.");
	const classSkills = choice.from.map(skillId);
	if (new Set(classSkills).size !== classSkills.length || choice.count > classSkills.length) throw new TypeError("Invalid Warlock skill choice source.");
	const skillEntries = acolyte.skillProficiencies;
	if (!Array.isArray(skillEntries) || skillEntries.length !== 1 || !skillEntries[0] || typeof skillEntries[0] !== "object" || Array.isArray(skillEntries[0]) || !Object.keys(skillEntries[0]).length || Object.values(skillEntries[0]).some(value => value !== true)) throw new TypeError("Unsupported Acolyte skill proficiency source.");
	const backgroundSkills = Object.keys(skillEntries[0]).map(skillId);
	if (new Set(backgroundSkills).size !== backgroundSkills.length) throw new TypeError("Duplicate Acolyte skill proficiency.");
	if (!Array.isArray(acolyte.ability) || !acolyte.ability.length) throw new TypeError("Unsupported Acolyte ability choice source.");
	const backgroundWeights = acolyte.ability.map(entry => {
		if (!entry || Object.keys(entry).join() !== "choose" || !entry.choose || Object.keys(entry.choose).join() !== "weighted") throw new TypeError("Unsupported Acolyte ability choice source.");
		const weighted = entry.choose.weighted;
		if (!weighted || Object.keys(weighted).sort().join() !== "from,weights" || !Array.isArray(weighted.from) || !Array.isArray(weighted.weights) || !weighted.from.length || new Set(weighted.from).size !== weighted.from.length || weighted.from.some(id => !abilityIds.has(id)) || weighted.weights.length > weighted.from.length || ![[2, 1], [1, 1, 1]].some(weights => weights.join() === weighted.weights.join())) throw new TypeError("Unsupported Acolyte ability choice source.");
		return weighted;
	});
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
	return {classSkills, classSkillCount: choice.count, backgroundSkills, backgroundAbilityIds: [...new Set(backgroundWeights.flatMap(weighted => weighted.from))], backgroundWeights, progression};
}

/** Create an empty Warlock build with the shared spellcasting ability selected. */
export function createWarlockDraft (dataset, options) {
	const document = createFighterDraft(dataset, options);
	document.build.class = {name: "Warlock", source: "XPHB"};
	document.build.species = {name: "Tiefling", source: "XPHB"};
	document.build.background = {name: "Acolyte", source: "XPHB"};
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

function increaseOptions (weights, abilityName, selected = []) {
	const result = [];
	const seen = new Set();
	for (const {from, weights: values} of weights) {
		const add = (chosen = []) => {
			if (chosen.length < values.length) {
				for (const id of from) if (!chosen.includes(id)) add([...chosen, id]);
				return;
			}
			const parts = chosen.map((id, index) => `${id}-${values[index]}`);
			const key = [...parts].sort().join(".");
			if (seen.has(key)) return;
			seen.add(key);
			result.push(option(parts.join("."), chosen.map((id, index) => `${abilityName(id)} +${values[index]}`).join(", ")));
		};
		add();
	}
	for (const value of selected) {
		if (result.some(entry => entry.id === value)) continue;
		const equivalent = result.find(entry => entry.id.split(".").sort().join(".") === value.split(".").sort().join("."));
		if (equivalent) result.push(option(value, equivalent.label));
	}
	return result;
}

/** Descriptor shape is shared with the Fighter editor and sheet validation. */
export function getWarlockChoiceDescriptors (document, catalog, {rules, sources, spells} = {}) {
	validateCharacterDocument(document);
	if (!isSupportedWarlockDocument(document)) return [];
	const species = catalog.species.find(entry => entry.ref.name === "Tiefling" && entry.ref.source === "XPHB");
	const warlock = rules?.classes?.["warlock|xphb"];
	const acolyte = rules?.backgrounds?.["acolyte|xphb"];
	if (!species || !warlock || !acolyte || !rules?.standardLanguages || !rules?.equipment || !rules?.invocations) throw new TypeError("Missing reviewed Warlock editor data.");
	const sourceChoices = getWarlockSourceChoices(sources);
	const progression = sourceChoices.progression(document.build.level);
	const abilities = getFighterAbilities(sources);
	const abilityName = id => abilities.find(ability => ability.id === id)?.label || id;
	const skillNames = new Map(createSkillCatalog(sources?.skills, sources?.abilityNames).flatMap(ability => ability.skills).map(skill => [skill.id, skill.name]));
	const decisions = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	const descriptor = (id, label, count, options, minimumLevel = 1, available = true) => ({
		id, label, count, options, selected: [...(decisions.get(id) || [])], available: document.build.level >= minimumLevel && available, minimumLevel,
	});
	const selectedLineage = species.lineages.find(lineage => lineage.id === decisions.get(species.lineageChoiceId)?.[0]);
	const abilityOptions = selectedLineage?.abilityOptions || [...new Set(species.lineages.flatMap(lineage => lineage.abilityOptions))];
	// Warlock fixes Charisma and both other sources allow it. Keep an existing
	// different selection available for imported characters without offering a
	// new conflicting choice.
	const castingAbilityOptions = (ids, choiceId) => ids.filter(id => id === "cha" || (decisions.get(choiceId) || []).includes(id)).map(id => option(id, abilityName(id)));
	const featMatches = (sources?.feats?.feat || []).filter(feat => feat.name === "Magic Initiate" && feat.source === "XPHB");
	const featAbilities = featMatches.length === 1 ? featMatches[0].additionalSpells?.find(group => group.name === "Cleric Spells")?.ability?.choose : null;
	if (!Array.isArray(featAbilities) || !featAbilities.length || featAbilities.some(id => !abilities.some(ability => ability.id === id))) throw new TypeError("Missing Magic Initiate ability choices.");
	if (!abilityOptions.includes("cha") || !featAbilities.includes("cha")) throw new TypeError("The supported Warlock sources require a shared Charisma spellcasting ability.");
	const rawSpells = spells?.spell || sources?.spells?.spell || spells || sources?.spells;
	if (!Array.isArray(rawSpells)) throw new TypeError("Missing Warlock spell data.");
	const spellOption = id => {
		const matches = rawSpells.filter(spell => `spell:${slug(spell.name)}|${spell.source.toLowerCase()}` === id);
		if (matches.length > 1) throw new TypeError(`Ambiguous spell ${id}.`);
		if (!matches.length) return {id, label: `Spell data unavailable: ${id}`, level: null};
		return {id, label: matches[0].name, level: matches[0].level};
	};
	const spellOptions = ids => ids.map(spellOption).map(({id, label}) => option(id, label));
	const preparedOptions = warlock.preparedOptions.map(spellOption).filter(spell => spell.level === null || spell.level <= progression.slotLevel).map(({id, label}) => option(id, label));
	const equipmentOptions = Object.entries(rules.equipment).filter(([, value]) => value.classId === "warlock|xphb" && value.backgroundId === "acolyte|xphb").map(([id, value]) => option(id, value.gear.join(", ")));
	const owner = "class:warlock|xphb";
	const invocationChoices = decisions.get(`${owner}:invocations`) || [];
	const invocations = Object.entries(rules.invocations).filter(([, value]) => value.minimumLevel <= document.build.level).map(([id, value]) => option(id, value.name));
	const featId = "feat:magic-initiate-cleric|xphb";
	const levelFourAbilities = abilities.map(ability => ability.id);
	const levelFourWeights = [{from: levelFourAbilities, weights: [2]}, {from: levelFourAbilities, weights: [1, 1]}];
	const result = [
		descriptor(species.lineageChoiceId, "Fiendish Legacy", 1, species.lineages.map(lineage => option(lineage.id, lineage.name))),
		descriptor(species.abilityChoiceId, "Species Spellcasting Ability", 1, castingAbilityOptions(abilityOptions, species.abilityChoiceId)),
		descriptor(species.sizeChoiceId, "Size", 1, species.sizes.map(id => option(id, id[0].toUpperCase() + id.slice(1)))),
		descriptor("background:acolyte|xphb:ability-increases", "Background Ability Increases", 1, increaseOptions(sourceChoices.backgroundWeights, abilityName, decisions.get("background:acolyte|xphb:ability-increases"))),
		descriptor("character:languages", "Languages (include Common)", 3, Object.entries(rules.standardLanguages).map(([id, label]) => option(id, label))),
		descriptor(`${owner}:skills`, "Warlock Skills", sourceChoices.classSkillCount, sourceChoices.classSkills.filter(id => !sourceChoices.backgroundSkills.includes(id)).map(id => option(id, skillNames.get(id)))),
		descriptor(`${owner}:equipment`, "Starting Equipment", 1, equipmentOptions),
		descriptor(`${featId}:ability`, "Magic Initiate Spellcasting Ability", 1, castingAbilityOptions(featAbilities, `${featId}:ability`)),
		descriptor(`${featId}:cantrips`, "Magic Initiate Cantrips", 2, spellOptions(["spell:guidance|xphb", "spell:light|xphb"])),
		descriptor(`${featId}:spell`, "Magic Initiate Level 1 Spell", 1, spellOptions(["spell:healing-word|xphb"])),
		descriptor(`${owner}:cantrips`, "Warlock Cantrips", progression.cantrips, spellOptions(warlock.cantripOptions)),
		descriptor(`${owner}:prepared-spells`, "Prepared Warlock Spells", progression.prepared, preparedOptions),
		descriptor(`${owner}:invocations`, "Eldritch Invocations", progression.invocations, invocations),
	];
	for (const [id, value] of Object.entries(rules.invocations).filter(([, value]) => value.cantripChoice)) {
		const options = value.cantripOptions.filter(spell => (decisions.get(`${owner}:cantrips`) || []).includes(spell));
		result.push(descriptor(`${owner}:${value.cantripChoice}`, `${value.name} Cantrip`, 1, spellOptions(options), value.minimumLevel, invocationChoices.includes(id)));
	}
	result.push(
		descriptor(`${owner}:subclass`, "Subclass", 1, [option(warlock.subclass.id, warlock.subclass.name)], 3),
		descriptor(`${owner}:level-4-feat`, "Level 4 Feat", 1, [option("ability-score-improvement|xphb", "Ability Score Improvement")], 4),
		descriptor(`${owner}:level-4-ability-increases`, "Level 4 Ability Increases", 1, increaseOptions(levelFourWeights, abilityName, decisions.get(`${owner}:level-4-ability-increases`)), 4),
	);
	return result;
}
