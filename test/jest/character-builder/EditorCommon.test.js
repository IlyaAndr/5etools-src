import {
	MANUAL_SCORE_RANGE, POINT_BUY_BUDGET, POINT_BUY_COSTS, STANDARD_ARRAY,
	createScoreDrafts, pointBuySpent, readScoreDraft, scoresForBuild,
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
