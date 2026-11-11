import {validateCharacterDocument} from "./character-document.js";
import {composeChoiceDescriptors} from "./compose-choices.js";
import {findClassRecord, refKey} from "./choice-common.js";
import {getBackgroundRule} from "./background-choices.js";
import {findSpeciesRule} from "./species-choices.js";
import {getFeatRule, getFeatSourceChoices} from "./feat-choices.js";
import {createCharacterDraft} from "./editor-common.js";
import {getFighterClassChoiceDescriptors} from "./fighter-choices.js";
import {getWarlockClassChoiceDescriptors} from "./warlock-choices.js";

/** Classes with reviewed class-choice providers. Later classes register here. */
const CLASS_PROVIDERS = {
	"fighter|xphb": {sourcesKey: "fighter", getDescriptors: getFighterClassChoiceDescriptors},
	"warlock|xphb": {sourcesKey: "warlock", getDescriptors: getWarlockClassChoiceDescriptors},
};

export const FIGHTER_PRESET = Object.freeze({
	characterClass: {name: "Fighter", source: "XPHB"},
	species: {name: "Gnome", source: "XPHB"},
	background: {name: "Soldier", source: "XPHB"},
});

export const WARLOCK_PRESET = Object.freeze({
	characterClass: {name: "Warlock", source: "XPHB"},
	species: {name: "Tiefling", source: "XPHB"},
	background: {name: "Acolyte", source: "XPHB"},
});

const sameRef = (left, right) => left?.name === right?.name && left?.source === right?.source;

function requireContext (context) {
	if (!context || typeof context !== "object" || !context.catalog || !context.rules) throw new TypeError("Missing reviewed editor context.");
	return context;
}

/** Read the class record behind a registered class choice provider. */
export function getClassContribution (document, {rules, sources, spells} = {}) {
	const classId = refKey(document.build.class);
	const provider = CLASS_PROVIDERS[classId];
	if (!provider) return {classDescriptors: [], spellcastingAbility: null};
	const record = findClassRecord(sources, provider.sourcesKey, document.build.class);
	return {
		classDescriptors: provider.getDescriptors(document, {rules, sources, spells}),
		spellcastingAbility: record?.spellcastingAbility || null,
	};
}

/** Compose every independent contribution for one reviewed character. */
export function getEditorChoiceDescriptors (document, catalog, context = {}) {
	validateCharacterDocument(document);
	if (!isSupportedEditorDocument(document, context)) return [];
	return composeChoiceDescriptors(document, catalog, context, getClassContribution(document, context));
}

/** A character is editable when every referenced source has reviewed choices. */
export function isSupportedEditorDocument (document, {catalog, rules} = {}) {
	const build = document?.build;
	if (!build || !Number.isInteger(build.level) || build.level < 1) return false;
	if (!build.class || typeof build.class.name !== "string" || typeof build.class.source !== "string") return false;
	const classRule = rules?.classes?.[refKey(build.class)];
	if (!classRule || !Array.isArray(classRule.levels) || build.level > classRule.levels.length) return false;
	if (!findSpeciesRule(catalog, build.species)) return false;
	if (!CLASS_PROVIDERS[refKey(build.class)]) return false;
	return !!getBackgroundRule(build.background, rules);
}

/**
 * Choose one shared spellcasting ability for a new build when every selected
 * source allows it. A class's fixed ability takes precedence; otherwise a
 * unique common ability is selected. Existing saved choices are never changed.
 */
export function findSharedSpellcastingAbility ({characterClass, species, background}, context = {}) {
	requireContext(context);
	const speciesRule = findSpeciesRule(context.catalog, species);
	const abilitySets = [];
	if (speciesRule) abilitySets.push([...new Set(speciesRule.lineages.flatMap(lineage => lineage.abilityOptions))]);
	const provider = CLASS_PROVIDERS[refKey(characterClass)];
	const classRecord = provider ? findClassRecord(context.sources, provider.sourcesKey, characterClass) : null;
	if (classRecord?.spellcastingAbility) abilitySets.push([classRecord.spellcastingAbility]);
	const feat = getFeatRule(background, context.rules);
	if (feat?.rule.spellGroup) abilitySets.push(getFeatSourceChoices(context.sources, feat).abilities);
	if (abilitySets.length < 2 || abilitySets.some(values => !values.length)) return null;
	const common = abilitySets.reduce((result, values) => result.filter(id => values.includes(id)));
	if (classRecord?.spellcastingAbility && common.includes(classRecord.spellcastingAbility)) return classRecord.spellcastingAbility;
	return common.length === 1 ? common[0] : null;
}

/** Create a valid draft for any combination with reviewed choices. */
export function createEditorDraft (dataset, {characterClass, species, background} = {}, context = {}, options) {
	requireContext(context);
	const selection = {characterClass, species, background};
	if (!findSpeciesRule(context.catalog, species)) throw new TypeError(`Unsupported editor species: ${species?.name || "missing"}.`);
	if (!CLASS_PROVIDERS[refKey(characterClass)]) throw new TypeError(`Unsupported editor class: ${characterClass?.name || "missing"}.`);
	if (!getBackgroundRule(background, context.rules)) throw new TypeError(`Unsupported editor background: ${background?.name || "missing"}.`);
	const document = createCharacterDraft(dataset, selection, options);
	const ability = findSharedSpellcastingAbility(selection, context);
	if (ability) {
		const speciesRule = findSpeciesRule(context.catalog, species);
		if (speciesRule.abilityChoiceId) document.build.choices.push({id: speciesRule.abilityChoiceId, selected: [ability]});
		const feat = getFeatRule(background, context.rules);
		if (feat?.rule.spellGroup) document.build.choices.push({id: `${feat.owner}:ability`, selected: [ability]});
	}
	validateCharacterDocument(document);
	return document;
}

/** List every species, class, and background that currently has reviewed choices. */
export function getEditorCombinations ({catalog, rules} = {}) {
	if (!catalog?.species || !rules?.classes || !rules?.backgrounds) throw new TypeError("Missing reviewed editor combinations.");
	const fromRules = record => Object.keys(record).map(id => ({name: record[id].name, source: id.slice(id.indexOf("|") + 1).toUpperCase()}));
	return {
		species: catalog.species.map(entry => ({name: entry.ref.name, source: entry.ref.source})),
		classes: fromRules(rules.classes).filter(entry => CLASS_PROVIDERS[refKey(entry)]),
		backgrounds: fromRules(rules.backgrounds),
	};
}

/** A profile creates drafts for one selection and edits any supported character. */
export function createEditorProfile ({id, title, scope, intro, context, preset = null, supports = null}) {
	if (![id, title, scope, intro].every(value => typeof value === "string" && value.trim())) throw new TypeError("Invalid editor profile.");
	requireContext(context);
	return {
		id,
		title,
		scope,
		intro,
		createDraft: (dataset, selection = preset, options) => {
			if (!selection) throw new TypeError(`Character selection is required for profile ${id}.`);
			return createEditorDraft(dataset, selection, context, options);
		},
		getChoiceDescriptors: (document, documentCatalog, current = {}) => {
			const resolvedCatalog = documentCatalog || current.catalog || context.catalog;
			return getEditorChoiceDescriptors(document, resolvedCatalog, {...context, ...current, catalog: resolvedCatalog});
		},
		isSupportedDocument: document => isSupportedEditorDocument(document, context) && (!supports || supports(document)),
	};
}

/** Build the reference presets and the generic combination editor. */
export function createEditorProfiles (context) {
	requireContext(context);
	return [
		createEditorProfile({
			id: "fighter",
			title: "Fighter editor",
			scope: "2024 rules · Gnome · Soldier · Fighter · levels 1–5",
			intro: "This editor supports the listed options only: Defense fighting style, Champion, Ability Score Improvement, Dice Set, and the displayed Fighter equipment package. Background equipment is added independently. Hit points use the fixed value. Other choices are not yet available.",
			context,
			preset: FIGHTER_PRESET,
			supports: document => sameRef(document.build.class, FIGHTER_PRESET.characterClass) && sameRef(document.build.species, FIGHTER_PRESET.species) && sameRef(document.build.background, FIGHTER_PRESET.background),
		}),
		createEditorProfile({
			id: "warlock",
			title: "Warlock editor",
			scope: "2024 rules · Tiefling · Acolyte · Warlock · levels 1–20",
			intro: "This editor supports the listed options only: the Fiend patron, selected invocations and spells, Magic Initiate (Cleric), Ability Score Improvement, and the displayed Warlock equipment package. Background equipment is added independently. Hit points use the fixed value. Other choices are not yet available.",
			context,
			preset: WARLOCK_PRESET,
			supports: document => sameRef(document.build.class, WARLOCK_PRESET.characterClass) && sameRef(document.build.species, WARLOCK_PRESET.species) && sameRef(document.build.background, WARLOCK_PRESET.background),
		}),
		createEditorProfile({
			id: "character",
			title: "Character editor",
			scope: "2024 rules · Gnome or Tiefling · Fighter or Warlock · Soldier or Acolyte · levels 1–5 (Fighter), 1–20 (Warlock)",
			intro: "Choose a supported species, class, and background before creating a character. Species, background, origin-feat, and class choices are independent, and class and background equipment are selected separately. Options outside the reviewed subset are not offered.",
			context,
		}),
	];
}
