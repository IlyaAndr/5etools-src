import {ABILITY_IDS} from "./character-document.js";

/** Adapt 2024 skill records into stable character-sheet ability groups. */
export function createSkillCatalog (data, abilityNames) {
	if (!Array.isArray(data?.skill)) throw new TypeError("skills: expected a skill source array.");
	if (!abilityNames || typeof abilityNames !== "object" || Array.isArray(abilityNames) || ABILITY_IDS.some(id => !Object.hasOwn(abilityNames, id) || typeof abilityNames[id] !== "string" || !abilityNames[id].trim())) throw new TypeError("skills: expected names for all six abilities.");
	const groups = ABILITY_IDS.map(id => ({id, name: abilityNames[id], skills: []}));
	const byAbility = new Map(groups.map(group => [group.id, group]));
	const ids = new Set();
	for (const skill of data.skill.filter(skill => skill?.source === "XPHB")) {
		if (typeof skill.name !== "string" || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(skill.name) || !byAbility.has(skill.ability)) throw new TypeError("skills: invalid 2024 skill record.");
		const id = skill.name.toLowerCase().replaceAll(" ", "-");
		if (ids.has(id)) throw new TypeError(`skills: duplicate 2024 skill ${id}.`);
		ids.add(id);
		byAbility.get(skill.ability).skills.push({id, name: skill.name});
	}
	if (ids.size !== 18) throw new TypeError("skills: expected all 18 skills from the 2024 Player's Handbook.");
	for (const group of groups) group.skills.sort((a, b) => a.name.localeCompare(b.name, "en"));
	return groups;
}
