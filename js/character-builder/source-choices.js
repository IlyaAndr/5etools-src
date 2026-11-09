import {createSkillCatalog} from "./skill-catalog.js";

/** Resolve source-qualified records without silently choosing among duplicates. */
export function getSourceRecord (records, ref) {
	if (!ref || typeof ref.name !== "string" || typeof ref.source !== "string") throw new TypeError("Missing source record reference.");
	const matches = Array.isArray(records) ? records.filter(entry => entry.name === ref.name && entry.source === ref.source) : [];
	if (matches.length !== 1) throw new TypeError(`Missing or ambiguous ${ref.source} ${ref.name} source record.`);
	return matches[0];
}

function skillIdReader (sources) {
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const skillIds = new Set(abilities.flatMap(ability => ability.skills).map(skill => skill.id));
	return name => {
		if (typeof name !== "string") throw new TypeError("Invalid skill in source record.");
		const id = name.toLowerCase().replaceAll(" ", "-");
		if (!skillIds.has(id)) throw new TypeError(`Missing skill ${id} in the skills catalog.`);
		return id;
	};
}

/** Read a class's starting skill choices independently of any background. */
export function getClassSkillChoices (sources, classRecord) {
	const skillId = skillIdReader(sources);
	const name = classRecord.name;
	const entries = classRecord.startingProficiencies?.skills;
	if (!Array.isArray(entries) || entries.length !== 1 || !entries[0] || Object.keys(entries[0]).join() !== "choose") throw new TypeError(`Unsupported ${name} skill proficiency source.`);
	const choice = entries[0].choose;
	if (!choice || Object.keys(choice).sort().join() !== "count,from" || !Array.isArray(choice.from) || !Number.isInteger(choice.count) || choice.count < 1) throw new TypeError(`Unsupported ${name} skill choice source.`);
	const classSkills = choice.from.map(skillId);
	if (new Set(classSkills).size !== classSkills.length || choice.count > classSkills.length) throw new TypeError(`Invalid ${name} skill choice source.`);
	return {classSkills, classSkillCount: choice.count};
}

/** Read background proficiencies and ability choices from its own 5etools record. */
export function getBackgroundSourceChoices (sources, ref) {
	const background = getSourceRecord(sources?.backgrounds?.background, ref);
	const abilities = createSkillCatalog(sources?.skills, sources?.abilityNames);
	const abilityIds = new Set(abilities.map(ability => ability.id));
	const skillId = skillIdReader(sources);
	const entries = background.skillProficiencies;
	if (!Array.isArray(entries) || entries.length !== 1 || !entries[0] || typeof entries[0] !== "object" || Array.isArray(entries[0]) || !Object.keys(entries[0]).length || Object.values(entries[0]).some(value => value !== true)) throw new TypeError(`Unsupported ${ref.name} skill proficiency source.`);
	const backgroundSkills = Object.keys(entries[0]).map(skillId);
	if (new Set(backgroundSkills).size !== backgroundSkills.length) throw new TypeError(`Duplicate ${ref.name} skill proficiency.`);
	if (!Array.isArray(background.ability) || !background.ability.length) throw new TypeError(`Unsupported ${ref.name} ability choice source.`);
	const backgroundWeights = background.ability.map(entry => {
		if (!entry || Object.keys(entry).join() !== "choose" || !entry.choose || Object.keys(entry.choose).join() !== "weighted") throw new TypeError(`Unsupported ${ref.name} ability choice source.`);
		const weighted = entry.choose.weighted;
		if (!weighted || Object.keys(weighted).sort().join() !== "from,weights" || !Array.isArray(weighted.from) || !Array.isArray(weighted.weights) || !weighted.from.length || new Set(weighted.from).size !== weighted.from.length || weighted.from.some(id => !abilityIds.has(id)) || weighted.weights.length > weighted.from.length || ![[2, 1], [1, 1, 1]].some(weights => weights.join() === weighted.weights.join())) throw new TypeError(`Unsupported ${ref.name} ability choice source.`);
		return weighted;
	});
	return {backgroundSkills, backgroundAbilityIds: [...new Set(backgroundWeights.flatMap(weighted => weighted.from))], backgroundWeights};
}
