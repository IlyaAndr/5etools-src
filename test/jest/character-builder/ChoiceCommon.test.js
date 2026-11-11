import {filterOptions, getSpellOptions, parseIncreaseOption, spellOption, spellOptionDetail} from "../../../js/character-builder/choice-common.js";

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

describe("Option filtering", () => {
	const options = [
		{id: "spell:hex|xphb", label: "Hex", detail: "L1, Enchantment"},
		{id: "spell:eldritch-blast|xphb", label: "Eldritch Blast", detail: "Cantrip, Evocation"},
		{id: "spell:armor-of-agathys|xphb", label: "Armor of Agathys", detail: "L1, Abjuration"},
	];

	it("matches names without regard to case or surrounding whitespace", () => {
		expect(filterOptions(options, "  BLAST ").map(option => option.id)).toEqual(["spell:eldritch-blast|xphb"]);
		expect(filterOptions(options, "hex").map(option => option.id)).toEqual(["spell:hex|xphb"]);
	});

	it("matches level and school details", () => {
		expect(filterOptions(options, "abjuration").map(option => option.id)).toEqual(["spell:armor-of-agathys|xphb"]);
		expect(filterOptions(options, "cantrip").map(option => option.id)).toEqual(["spell:eldritch-blast|xphb"]);
	});

	it("keeps every option for an empty query", () => {
		expect(filterOptions(options, "")).toBe(options);
		expect(filterOptions(options, "   ")).toBe(options);
		expect(filterOptions(options, undefined)).toBe(options);
	});

	it("returns no options when nothing matches", () => {
		expect(filterOptions(options, "wish")).toEqual([]);
	});
});

describe("Ability increase options", () => {
	it("parses saved increases into ability amounts", () => {
		expect(parseIncreaseOption("str-2.con-1")).toEqual([{ability: "str", amount: 2}, {ability: "con", amount: 1}]);
		expect(parseIncreaseOption("int-1.wis-1.cha-1")).toEqual([{ability: "int", amount: 1}, {ability: "wis", amount: 1}, {ability: "cha", amount: 1}]);
	});

	it("rejects unsupported or duplicate increases", () => {
		for (const value of [null, "", "str", "str-3", "str-2.str-1", "strength-2", "str-2.", ".str-2"]) {
			expect(parseIncreaseOption(value)).toBeNull();
		}
	});
});
