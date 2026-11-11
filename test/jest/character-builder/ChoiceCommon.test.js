import {getSpellOptions, spellOption, spellOptionDetail} from "../../../js/character-builder/choice-common.js";

const spells = [
	{name: "Eldritch Blast", source: "XPHB", level: 0, school: "V"},
	{name: "Armor of Agathys", source: "XPHB", level: 1, school: "A"},
	{name: "Homebrew Bolt", source: "HB", level: 2},
];

describe("Spell choice options", () => {
	it("keeps reviewed spell names and adds level and school details", () => {
		expect(getSpellOptions(spells, ["spell:eldritch-blast|xphb", "spell:armor-of-agathys|xphb"])).toEqual([
			{id: "spell:eldritch-blast|xphb", label: "Eldritch Blast", detail: "Cantrip, Evocation"},
			{id: "spell:armor-of-agathys|xphb", label: "Armor of Agathys", detail: "L1, Abjuration"},
		]);
		expect(getSpellOptions(spells, ["spell:armor-of-agathys|xphb"]).map(option => option.id)).toEqual(["spell:armor-of-agathys|xphb"]);
	});

	it("keeps unknown spells visible without inventing details", () => {
		expect(getSpellOptions(spells, ["spell:missing|xphb"])).toEqual([
			{id: "spell:missing|xphb", label: "Spell data unavailable: spell:missing|xphb"},
		]);
	});

	it("omits details that the source does not provide", () => {
		expect(spellOption({id: "spell:homebrew-bolt|hb", label: "Homebrew Bolt", level: 2, school: null})).toEqual({
			id: "spell:homebrew-bolt|hb",
			label: "Homebrew Bolt",
			detail: "L2",
		});
		expect(spellOptionDetail({level: null, school: null})).toBeNull();
	});

	it("rejects ambiguous spell identifiers", () => {
		expect(() => getSpellOptions([...spells, {...spells[0]}], ["spell:eldritch-blast|xphb"])).toThrow(/Ambiguous spell spell:eldritch-blast\|xphb/);
	});
});
