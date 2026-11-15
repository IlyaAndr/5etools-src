import {
	MANUAL_SCORE_RANGE, POINT_BUY_BUDGET, POINT_BUY_COSTS, STANDARD_ARRAY,
	createCharacterDraft, createScoreDrafts, dropOrphanedChoices, pointBuySpent, pruneDependentChoices, readScoreDraft, replaceSources, scoresForBuild, setCharacterChoice,
} from "../../../js/character-builder/editor-common.js";

const abilityIds = ["str", "dex", "con", "int", "wis", "cha"];
const draftOf = values => Object.fromEntries(abilityIds.map((id, index) => [id, values[index]]));

describe("Ability-score drafts", () => {
	it("reads entries as numbers and leaves blank entries unset", () => {
		expect(readScoreDraft(abilityIds, draftOf(["15", "", "-2", 13, null, "abc"]))).toEqual({
			str: 15, dex: null, con: -2, int: 13, wis: null, cha: null,
		});
	});

	it("totals the reviewed point-buy costs", () => {
		expect(pointBuySpent(draftOf([15, 14, 13, 12, 10, 8]))).toBe(POINT_BUY_BUDGET);
		expect(pointBuySpent(draftOf([8, 8, 8, 8, 8, 8]))).toBe(0);
		expect(pointBuySpent(draftOf([15, 15, 15, 15, 15, 15]))).toBe(54);
		expect(Number.isNaN(pointBuySpent(draftOf([16, 8, 8, 8, 8, 8])))).toBe(true);
	});

	it("saves a standard array only when every value is used once", () => {
		expect(scoresForBuild("standard", abilityIds, draftOf([15, 14, 13, 12, 10, 8]))).toEqual({
			str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8,
		});
		expect(scoresForBuild("standard", abilityIds, draftOf([8, 10, 12, 13, 14, 15]))).toEqual({
			str: 8, dex: 10, con: 12, int: 13, wis: 14, cha: 15,
		});
		expect(scoresForBuild("standard", abilityIds, draftOf([15, 15, 13, 12, 10, 8]))).toBeNull();
		expect(scoresForBuild("standard", abilityIds, draftOf([15, 14, 13, 12, 10, null]))).toBeNull();
		expect(scoresForBuild("standard", abilityIds, draftOf([14, 13, 13, 12, 10, 8]))).toBeNull();
	});

	it("saves point buy only when the whole budget is spent", () => {
		expect(scoresForBuild("pointBuy", abilityIds, draftOf([15, 14, 13, 12, 10, 8]))).toEqual({
			str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8,
		});
		expect(scoresForBuild("pointBuy", abilityIds, draftOf([15, 14, 13, 11, 10, 8]))).toBeNull();
		expect(scoresForBuild("pointBuy", abilityIds, draftOf([15, 15, 15, 15, 13, 8]))).toBeNull();
		expect(scoresForBuild("pointBuy", abilityIds, draftOf([8, 8, 8, 8, 8, 8]))).toBeNull();
	});

	it("accepts manual scores inside 1–20 and reports the rest", () => {
		expect(scoresForBuild("manual", abilityIds, draftOf([18, 16, 14, 12, 10, 8]))).toEqual({
			str: 18, dex: 16, con: 14, int: 12, wis: 10, cha: 8,
		});
		expect(scoresForBuild("manual", abilityIds, draftOf([18, 16, 14, 12, 10, 20]))).not.toBeNull();
		expect(scoresForBuild("manual", abilityIds, draftOf([21, 16, 14, 12, 10, 8]))).toBeNull();
		expect(scoresForBuild("manual", abilityIds, draftOf([0, 16, 14, 12, 10, 8]))).toBeNull();
		expect(scoresForBuild("manual", abilityIds, draftOf([18, 16, 14, 12, 10, ""]))).toBeNull();
	});

	it("converts saved scores into one independent draft per method", () => {
		const standard = createScoreDrafts(abilityIds, draftOf([15, 14, 13, 12, 10, 8]));
		expect(standard.standard).toEqual(draftOf([15, 14, 13, 12, 10, 8]));
		expect(standard.pointBuy).toEqual(draftOf([15, 14, 13, 12, 10, 8]));
		expect(standard.manual).toEqual(draftOf(["15", "14", "13", "12", "10", "8"]));

		const manual = createScoreDrafts(abilityIds, draftOf([18, 16, 14, 12, 10, 8]));
		expect(manual.standard).toEqual(draftOf([null, null, 14, 12, 10, 8]));
		expect(manual.manual).toEqual(draftOf(["18", "16", "14", "12", "10", "8"]));
		expect(pointBuySpent(manual.pointBuy)).toBe(POINT_BUY_BUDGET);
		expect(Object.values(manual.pointBuy).every(value => POINT_BUY_COSTS[value] !== undefined)).toBe(true);
	});

	it("starts every method at an empty or neutral draft", () => {
		const empty = createScoreDrafts(abilityIds, null);
		expect(empty.standard).toEqual(Object.fromEntries(abilityIds.map(id => [id, null])));
		expect(empty.pointBuy).toEqual(Object.fromEntries(abilityIds.map(id => [id, 8])));
		expect(empty.manual).toEqual(Object.fromEntries(abilityIds.map(id => [id, ""])));
		expect(scoresForBuild("pointBuy", abilityIds, empty.pointBuy)).toBeNull();
	});

	it("keeps the reviewed standard array and manual range", () => {
		expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
		expect(MANUAL_SCORE_RANGE).toEqual({min: 1, max: 20});
	});
});

describe("Dependent choices", () => {
	const dataset = {id: "5etools", version: "test", revision: "a".repeat(40)};
	const owner = "class:warlock|xphb";
	const invocation = "pact-of-the-blade|xphb";
	const descriptors = [{
		id: `${owner}:pact-weapon`,
		label: "Pact Weapon",
		count: 1,
		options: [],
		selected: ["longsword|xphb"],
		available: false,
		minimumLevel: 1,
		dependsOn: {choice: `${owner}:invocations`, option: invocation},
	}];
	const warlockDraft = () => createCharacterDraft(dataset, {
		characterClass: {name: "Warlock", source: "XPHB"},
		species: {name: "Tiefling", source: "XPHB"},
		background: {name: "Acolyte", source: "XPHB"},
	});
	const draftWithPactWeapon = () => setCharacterChoice(
		setCharacterChoice(warlockDraft(), `${owner}:invocations`, [invocation]),
		`${owner}:pact-weapon`, ["longsword|xphb"],
	);

	it("drops a dependent choice when the same edit removes its prerequisite", () => {
		const previous = setCharacterChoice(draftWithPactWeapon(), `${owner}:cantrips`, ["spell:eldritch-blast|xphb"]);
		const next = setCharacterChoice(previous, `${owner}:invocations`, []);
		const pruned = pruneDependentChoices(previous, next, descriptors);
		expect(pruned.build.choices.map(choice => choice.id)).toEqual([`${owner}:cantrips`]);
	});

	it("keeps a dependent choice while its prerequisite stays selected", () => {
		const previous = draftWithPactWeapon();
		const next = setCharacterChoice(previous, `${owner}:cantrips`, ["spell:eldritch-blast|xphb"]);
		expect(pruneDependentChoices(previous, next, descriptors)).toBe(next);
	});

	it("keeps an imported dependent choice whose prerequisite was already missing", () => {
		const previous = setCharacterChoice(warlockDraft(), `${owner}:pact-weapon`, ["longsword|xphb"]);
		const next = setCharacterChoice(previous, `${owner}:cantrips`, ["spell:eldritch-blast|xphb"]);
		expect(pruneDependentChoices(previous, next, descriptors)).toBe(next);
	});

	it("ignores choices without a reviewed dependency", () => {
		const previous = draftWithPactWeapon();
		const next = setCharacterChoice(previous, `${owner}:invocations`, []);
		expect(pruneDependentChoices(previous, next, [])).toBe(next);
	});
});

describe("Source replacement", () => {
	const dataset = {id: "5etools", version: "test", revision: "a".repeat(40)};
	const selection = {
		characterClass: {name: "Fighter", source: "XPHB"},
		species: {name: "Gnome", source: "XPHB"},
		background: {name: "Soldier", source: "XPHB"},
	};
	const draftWithChoices = () => {
		let document = createCharacterDraft(dataset, selection);
		for (const [id, selected] of [
			["species:gnome|xphb:lineage", ["forest"]],
			["class:fighter|xphb:style", ["defense"]],
			["background:soldier|xphb:tool", ["dice-set|xphb"]],
			["feat:savage-attacker|xphb:ability", ["str"]],
			["character:languages", ["elvish|xphb"]],
		]) document = setCharacterChoice(document, id, selected);
		return document;
	};

	it("replaces a source and drops only that source's choices", () => {
		const previous = draftWithChoices();
		const next = replaceSources(previous, {...selection, characterClass: {name: "Warlock", source: "XPHB"}});
		expect(next.build.class).toEqual({name: "Warlock", source: "XPHB"});
		expect(next.build.choices.map(choice => choice.id)).toEqual([
			"species:gnome|xphb:lineage",
			"background:soldier|xphb:tool",
			"feat:savage-attacker|xphb:ability",
			"character:languages",
		]);
	});

	it("keeps ability scores, level, name, and session state", () => {
		const previous = {
			...draftWithChoices(),
			name: "Kept name",
			session: {hp: {current: 7, temporary: 2}, resources: [], notes: "Kept note"},
		};
		previous.build = {
			...previous.build,
			level: 3,
			abilities: {method: "manual", scores: {str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8}},
		};
		const next = replaceSources(previous, {...selection, species: {name: "Dwarf", source: "XPHB"}});
		expect(next.name).toBe("Kept name");
		expect(next.session).toEqual(previous.session);
		expect(next.build.level).toBe(3);
		expect(next.build.abilities).toEqual(previous.build.abilities);
		expect(next.build.choices.some(choice => choice.id.startsWith("species:"))).toBe(false);
	});

	it("returns the same document when no source changes", () => {
		const previous = draftWithChoices();
		expect(replaceSources(previous, selection)).toBe(previous);
	});

	it("changes only the source that differs", () => {
		const previous = draftWithChoices();
		const next = replaceSources(previous, {...selection, background: {name: "Acolyte", source: "XPHB"}});
		expect(next.build.species).toEqual(selection.species);
		expect(next.build.class).toEqual(selection.characterClass);
		expect(next.build.background).toEqual({name: "Acolyte", source: "XPHB"});
		expect(next.build.choices.some(choice => choice.id.startsWith("background:"))).toBe(false);
		expect(next.build.choices.some(choice => choice.id.startsWith("species:"))).toBe(true);
	});

	it("drops choices the new document no longer offers and keeps already-unknown ones", () => {
		const previous = setCharacterChoice(draftWithChoices(), "custom:unknown", ["value"]);
		const previousDescriptors = [
			"species:gnome|xphb:lineage", "class:fighter|xphb:style",
			"background:soldier|xphb:tool", "feat:savage-attacker|xphb:ability", "character:languages",
		].map(id => ({id}));
		const nextDescriptors = [
			"species:gnome|xphb:lineage", "class:fighter|xphb:style", "character:languages",
		].map(id => ({id}));
		const pruned = dropOrphanedChoices(previous, previousDescriptors, nextDescriptors);
		expect(pruned.build.choices.map(choice => choice.id)).toEqual([
			"species:gnome|xphb:lineage",
			"class:fighter|xphb:style",
			"character:languages",
			"custom:unknown",
		]);
	});

	it("returns the same document when no choice is orphaned", () => {
		const previous = draftWithChoices();
		const descriptors = previous.build.choices.map(choice => ({id: choice.id}));
		expect(dropOrphanedChoices(previous, descriptors, descriptors)).toBe(previous);
	});
});
