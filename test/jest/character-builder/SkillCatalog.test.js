import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSkillCatalog} from "../../../js/character-builder/skill-catalog.js";

const abilityNames = globalThis.Parser.ATB_ABV_TO_FULL;
const source = JSON.parse(readFileSync(new URL("../../../data/skills.json", import.meta.url), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));

describe("2024 skill catalog", () => {
	it("groups all skills from the source in sheet order without modifying the data", () => {
		const original = clone(source);
		const groups = createSkillCatalog(source, abilityNames);
		expect(groups.map(group => group.id)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
		expect(groups.flatMap(group => group.skills)).toHaveLength(18);
		expect(groups.find(group => group.id === "dex").skills).toContainEqual({id: "sleight-of-hand", name: "Sleight of Hand"});
		expect(groups.find(group => group.id === "con").skills).toEqual([]);
		expect(source).toEqual(original);
	});

	it("uses the source's ability association rather than a second mapping", () => {
		const data = clone(source);
		data.skill.find(skill => skill.source === "XPHB" && skill.name === "Survival").ability = "cha";
		const groups = createSkillCatalog(data, abilityNames);
		expect(groups.find(group => group.id === "cha").skills).toContainEqual({id: "survival", name: "Survival"});
		expect(groups.find(group => group.id === "wis").skills).not.toContainEqual({id: "survival", name: "Survival"});
	});

	it("uses the injected canonical ability labels", () => {
		const labels = {...abilityNames, str: "Test Strength"};
		expect(createSkillCatalog(source, labels)[0].name).toBe("Test Strength");
		expect(createSkillCatalog(source, abilityNames)[0].name).toBe(globalThis.Parser.ATB_ABV_TO_FULL.str);
		expect(() => createSkillCatalog(source, {...abilityNames, str: ""})).toThrow(/abilit/i);
		expect(() => createSkillCatalog(source)).toThrow(/abilit/i);
	});

	it.each([
		["missing data", () => undefined],
		["missing edition", data => ({skill: data.skill.filter(skill => skill.source !== "XPHB")})],
		["missing skill", data => ({skill: data.skill.filter(skill => !(skill.source === "XPHB" && skill.name === "Stealth"))})],
		["duplicate skill", data => { data.skill.push({...data.skill.find(skill => skill.source === "XPHB")}); return data; }],
		["invalid ability", data => { data.skill.find(skill => skill.source === "XPHB").ability = "invalid"; return data; }],
		["invalid name", data => { data.skill.find(skill => skill.source === "XPHB").name = ""; return data; }],
	])("rejects %s", (_label, change) => {
		expect(() => createSkillCatalog(change(clone(source)), abilityNames)).toThrow(TypeError);
	});
});
