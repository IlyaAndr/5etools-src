import {validateCharacterDocument} from "./character-document.js";
import {createSkillCatalog} from "./skill-catalog.js";

export const ABILITY_SCORE_METHODS = [
	{id: "standard", label: "Standard Array", note: "Fastest. Use each of 15, 14, 13, 12, 10, and 8 exactly once."},
	{id: "pointBuy", label: "Point Buy", note: "Spend 27 points on scores from 8 to 15; each step shows its cost."},
	{id: "manual", label: "Manual", note: "Type the six scores from 1 to 20 when your table rolls or assigns them."},
];

/** Reviewed 2024 ability-score values, mirrored by the sheet-model checks. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COSTS = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9};
export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_RANGE = {min: 8, max: 15};
export const MANUAL_SCORE_RANGE = {min: 1, max: 20};

/** Total point-buy cost, or NaN when a score is outside the reviewed table. */
export function pointBuySpent (values) {
	return Object.values(values).reduce((sum, value) => sum + (POINT_BUY_COSTS[value] ?? NaN), 0);
}

/** Read a draft as numbers, keeping null for entries that are not whole numbers. */
export function readScoreDraft (abilityIds, draft) {
	const values = {};
	for (const id of abilityIds) {
		const raw = `${draft[id] ?? ""}`.trim();
		values[id] = /^-?\d+$/.test(raw) ? Number(raw) : null;
	}
	return values;
}

/** The six base scores the document can save, or null while they are incomplete or outside the method. */
export function scoresForBuild (method, abilityIds, draft) {
	const values = readScoreDraft(abilityIds, draft);
	if (Object.values(values).some(value => value == null)) return null;
	if (method === "manual") return Object.values(values).every(value => value >= MANUAL_SCORE_RANGE.min && value <= MANUAL_SCORE_RANGE.max) ? values : null;
	if (method === "pointBuy") return Object.values(values).every(value => POINT_BUY_COSTS[value] !== undefined) && pointBuySpent(values) === POINT_BUY_BUDGET ? values : null;
	const expected = [...STANDARD_ARRAY].sort((a, b) => a - b).join(",");
	return Object.values(values).sort((a, b) => a - b).join(",") === expected ? values : null;
}

/**
 * Prepare one independent draft per method from saved scores, so switching the
 * method keeps what the player already entered instead of discarding it.
 */
export function createScoreDrafts (abilityIds, scores) {
	const source = scores || {};
	const standard = {};
	const used = new Set();
	for (const id of abilityIds) {
		const value = Number.isInteger(source[id]) && STANDARD_ARRAY.includes(source[id]) && !used.has(source[id]) ? source[id] : null;
		if (value != null) used.add(value);
		standard[id] = value;
	}
	const pointBuy = {};
	for (const id of abilityIds) pointBuy[id] = Number.isInteger(source[id]) ? Math.min(POINT_BUY_RANGE.max, Math.max(POINT_BUY_RANGE.min, source[id])) : POINT_BUY_RANGE.min;
	// Lower the highest scores until the converted draft fits the reviewed budget.
	while (pointBuySpent(pointBuy) > POINT_BUY_BUDGET) {
		const highest = abilityIds.filter(id => pointBuy[id] > POINT_BUY_RANGE.min).sort((a, b) => pointBuy[b] - pointBuy[a])[0];
		pointBuy[highest] -= 1;
	}
	const manual = {};
	for (const id of abilityIds) manual[id] = Number.isInteger(source[id]) && source[id] >= MANUAL_SCORE_RANGE.min && source[id] <= MANUAL_SCORE_RANGE.max ? `${source[id]}` : "";
	return {standard, pointBuy, manual};
}

const copy = value => JSON.parse(JSON.stringify(value));
export const getEditorAbilities = sources => createSkillCatalog(sources?.skills, sources?.abilityNames).map(({id, name}) => ({id, label: name}));

/** Create a draft without coupling the editor's shared document to a class. */
export function createCharacterDraft (dataset, {characterClass, species, background}, {getRandomValues = bytes => globalThis.crypto.getRandomValues(bytes)} = {}) {
	// getRandomValues is available on non-secure HTTP origins, unlike randomUUID.
	const bytes = getRandomValues(new Uint8Array(16));
	if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new TypeError("Character ID generator must return 16 random bytes.");
	const document = {
		schemaVersion: 1,
		id: `character-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`,
		name: "New Character",
		status: "draft",
		ruleset: "2024",
		dataset: copy(dataset),
		build: {
			level: 1,
			class: copy(characterClass),
			species: copy(species),
			background: copy(background),
			abilities: {method: "standard", scores: null},
			choices: [],
		},
		session: {hp: {current: null, temporary: 0}, resources: [], notes: ""},
	};
	validateCharacterDocument(document);
	return document;
}

/** Save an explicit edit without altering any other decision or session value. */
export function setCharacterChoice (document, id, selected) {
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

/**
 * Drop the saved selection of a choice whose reviewed prerequisite was removed
 * by the same edit, such as an invocation's Pact Weapon or cantrip after the
 * invocation itself is deselected. The prerequisite must have been satisfied
 * before the edit and be gone afterwards, so opening an imported document or
 * lowering the level keeps saved choices for the user to review.
 */
export function pruneDependentChoices (previous, next, descriptors) {
	const selections = (document, id) => document?.build.choices.find(choice => choice.id === id)?.selected || [];
	let result = next;
	for (const descriptor of descriptors) {
		const dependency = descriptor.dependsOn;
		if (!dependency || !selections(result, descriptor.id).length) continue;
		if (selections(next, dependency.choice).includes(dependency.option)) continue;
		if (!selections(previous, dependency.choice).includes(dependency.option)) continue;
		result = setCharacterChoice(result, descriptor.id, []);
	}
	return result;
}

/**
 * Fill every selection that is not a real decision: options the reviewed source
 * requires, and choices that offer exactly one legal option. Saved selections
 * are never replaced, and the same document is returned when nothing changes so
 * callers can detect a stable result.
 */
export function applySingleOptionSelections (document, descriptors) {
	let next = document;
	for (const descriptor of descriptors) {
		if (!descriptor.available) continue;
		const current = next.build.choices.find(choice => choice.id === descriptor.id)?.selected || [];
		if (current.length >= descriptor.count) continue;
		const additions = [
			...(descriptor.required || []).filter(id => descriptor.options.some(option => option.id === id) && !current.includes(id)),
			...(descriptor.count === 1 && !current.length && descriptor.options.length === 1 ? [descriptor.options[0].id] : []),
		];
		const selected = [...new Set([...current, ...additions])].slice(0, descriptor.count);
		if (selected.length !== current.length || selected.some((id, index) => id !== current[index])) next = setCharacterChoice(next, descriptor.id, selected);
	}
	return next;
}
