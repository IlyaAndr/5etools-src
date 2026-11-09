import {validateCharacterDocument} from "./character-document.js";
import {createSkillCatalog} from "./skill-catalog.js";

export const ABILITY_SCORE_METHODS = [
	{id: "standard", label: "Standard Array"}, {id: "pointBuy", label: "Point Buy"}, {id: "manual", label: "Manual"},
];

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
