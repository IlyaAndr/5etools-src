import {planSpellcastingChoices} from "../../../js/character-builder/spellcasting-choice.js";

describe("Shared spellcasting ability planning", () => {
	it("chooses the fixed class ability for all compatible sources", () => {
		const sources = [
			{id: "class", allowed: ["cha"]},
			{id: "species", allowed: ["int", "wis", "cha"]},
			{id: "feat", allowed: ["int", "wis", "cha"]},
		];
		const before = JSON.stringify(sources);
		const plan = planSpellcastingChoices({sources, abilityScores: {int: 18, wis: 10, cha: 16}});
		expect(plan.commonAbilities).toEqual(["cha"]);
		expect(plan.requiresDifferentAbilities).toBe(false);
		expect(plan.sources.map(source => source.suggested)).toEqual(["cha", "cha", "cha"]);
		expect(JSON.stringify(sources)).toBe(before);
	});

	it("prefers the specified common choice, then the highest available score", () => {
		const sources = [{id: "species", allowed: ["int", "wis", "cha"]}, {id: "feat", allowed: ["int", "wis", "cha"]}];
		expect(planSpellcastingChoices({sources, preferredAbility: "wis", abilityScores: {int: 18, wis: 10, cha: 16}}).sources.map(source => source.suggested)).toEqual(["wis", "wis"]);
		expect(planSpellcastingChoices({sources, abilityScores: {int: 18, wis: 10, cha: 16}}).sources.map(source => source.suggested)).toEqual(["int", "int"]);
	});

	it("uses the fewest distinct abilities when no common ability is legal", () => {
		const sources = [
			{id: "first", allowed: ["int", "wis"]},
			{id: "second", allowed: ["int", "cha"]},
			{id: "third", allowed: ["wis", "cha"]},
		];
		const plan = planSpellcastingChoices({sources, preferredAbility: "cha", abilityScores: {int: 17, wis: 10, cha: 16}});
		expect(plan.commonAbilities).toEqual([]);
		expect(plan.requiresDifferentAbilities).toBe(true);
		expect(new Set(plan.sources.map(source => source.suggested)).size).toBe(2);
		expect(plan.sources.map(source => source.suggested)).toEqual(["int", "cha", "cha"]);
	});

	it("retains conflicting saved choices even when a common ability would be legal", () => {
		const sources = [{id: "class", allowed: ["cha"]}, {id: "species", allowed: ["int", "wis", "cha"], selected: "int"}, {id: "feat", allowed: ["int", "wis", "cha"], selected: "wis"}];
		const plan = planSpellcastingChoices({sources, preferredAbility: "cha"});
		expect(plan.commonAbilities).toEqual(["cha"]);
		expect(plan.requiresDifferentAbilities).toBe(false);
		expect(plan.hasSavedDifferences).toBe(true);
		expect(plan.sources.map(source => [source.selected, source.suggested])).toEqual([[null, "cha"], ["int", "int"], ["wis", "wis"]]);
	});

	it("preserves conflicting saved choices without adding another ability for an unselected source", () => {
		const plan = planSpellcastingChoices({
			sources: [{id: "class", allowed: ["cha"]}, {id: "species", allowed: ["int", "cha"], selected: "int"}, {id: "feat", allowed: ["wis", "cha"]}],
			preferredAbility: "cha",
		});
		expect(plan.sources.map(source => source.suggested)).toEqual(["cha", "int", "cha"]);
		expect(plan.hasSavedDifferences).toBe(true);
	});

	it("ignores a preferred ability unavailable to the sources", () => {
		const plan = planSpellcastingChoices({sources: [{id: "class", allowed: ["cha"]}, {id: "species", allowed: ["wis", "cha"]}], preferredAbility: "int"});
		expect(plan.sources.map(source => source.suggested)).toEqual(["cha", "cha"]);
	});

	it("detects one saved choice conflicting with a source's fixed ability", () => {
		const plan = planSpellcastingChoices({sources: [{id: "class", allowed: ["cha"]}, {id: "species", allowed: ["int", "cha"], selected: "int"}]});
		expect(plan.hasSavedDifferences).toBe(true);
		expect(plan.requiresDifferentAbilities).toBe(false);
		expect(plan.sources.map(source => source.suggested)).toEqual(["cha", "int"]);
	});

	it("accepts an empty set of spellcasting sources", () => {
		expect(planSpellcastingChoices({sources: []})).toEqual({commonAbilities: [], requiresDifferentAbilities: false, hasSavedDifferences: false, sources: []});
	});

	it.each([
		{},
		{sources: Array(1)},
		{sources: [{id: "x", allowed: []}]},
		{sources: [{id: "x", allowed: ["invalid"]}]},
		{sources: [{id: "x", allowed: ["cha", "cha"]}]},
		{sources: [{id: "x", allowed: ["cha"], selected: "int"}]},
		{sources: [{id: "x", allowed: ["cha"]}, {id: "x", allowed: ["int"]}]},
		{sources: [], preferredAbility: "invalid"},
		{sources: [], abilityScores: {cha: NaN}},
	])("rejects malformed data %#", input => {
		expect(() => planSpellcastingChoices(input)).toThrow(TypeError);
	});
});
