import {parseCharacterDocument, serializeCharacterDocument} from "./character-document.js";
import {createSpeciesCatalog} from "./species-catalog.js";
import {renderCharacterSheet} from "./sheet-renderer.js";
import {createCharacterSheetModel} from "./character-sheet-model.js";
import {createCharacterEditor} from "./character-editor.js";
import {createEditorProfiles, getEditorCombinations} from "./editor-profile.js";
import {renderSelectionInfo} from "./source-info.js";

const importInput = document.getElementById("character-import");
const printButton = document.getElementById("print-sheet");
const status = document.getElementById("status");
const errorMessage = document.getElementById("error-message");
const retryButton = document.getElementById("retry-load");
const preview = document.getElementById("sheet-preview");
const newCharacterButton = document.getElementById("new-character");
const saveButton = document.getElementById("save-character");
const editorContainer = document.getElementById("fighter-editor");
const selectionInfo = new Map([...document.querySelectorAll(".cb-editor__option-info[data-info]")].map(slot => [slot.dataset.info, slot]));
const compactToggle = document.getElementById("compact-sheet");
const pageCount = document.getElementById("sheet-pages");
const listElements = {
	species: document.getElementById("species-list"),
	class: document.getElementById("class-list"),
	background: document.getElementById("background-list"),
};
const selection = {species: "", class: "", background: ""};
const characterName = document.getElementById("character-name");

let catalog;
let sheetContext;
let hasPreview = false;
let requestId = 0;
let currentCharacter;
let editor;

function clearError () {
	errorMessage.hidden = true;
	errorMessage.textContent = "";
}

function showError (message) {
	errorMessage.textContent = message;
	errorMessage.hidden = false;
}

function showDocument (character) {
	const model = createCharacterSheetModel(character, catalog, sheetContext);
	const html = renderCharacterSheet(model, catalog);
	preview.innerHTML = html;
	if (document.activeElement !== characterName) characterName.value = character.name;
	characterName.disabled = false;
	const pages = preview.querySelectorAll(".cb-page").length;
	pageCount.textContent = pages ? `${pages} ${pages === 1 ? "page" : "pages"} to print.` : "";
	document.title = `${character.name} — Character Builder`;
	currentCharacter = character;
	hasPreview = true;
	printButton.disabled = false;
	saveButton.disabled = false;
	newCharacterButton.disabled = false;
	printButton.textContent = model.status === "complete" ? "Print / Save PDF" : "Print draft summary";
	preview.setAttribute("aria-busy", "false");
	clearError();
	return model.status;
}

/**
 * Render one picker list with the same rows the editor uses, so the starting
 * choices read like the rest of the page; choosing a row is the selection.
 */
function renderList (kind, entries) {
	listElements[kind].replaceChildren(...entries.map(entry => {
		const row = document.createElement("label");
		row.className = "cb-editor__option";
		const input = document.createElement("input");
		input.type = "radio";
		input.name = kind;
		input.value = `${entry.name}|${entry.source}`;
		input.dataset.value = input.value;
		input.setAttribute("aria-label", entry.name);
		input.addEventListener("change", () => {
			selection[kind] = input.value;
			reflectSelection();
			showSelectionInfo();
			createFromSelection();
		});
		const name = document.createElement("span");
		name.textContent = entry.name;
		row.append(input, name);
		return row;
	}));
}

/** Mark the selected option in each list, so the choice is visible at a glance. */
function reflectSelection () {
	for (const [kind, container] of Object.entries(listElements)) {
		for (const input of container.querySelectorAll("input")) input.checked = input.value === selection[kind];
	}
}

const STATUS_PROMPT = "Choose a species, class, and background to create a character.";

/** Read one picker value as a source-qualified reference. */
function readRef (value) {
	const [name, source] = `${value}`.split("|");
	return name && source ? {name, source} : null;
}

const sameRef = (left, right) => !!left && !!right && left.name === right.name && left.source === right.source;

/** Show the pickers at the values the open character was built from. */
function selectFrom (character) {
	const build = character?.build;
	if (!build?.class || !build?.species || !build?.background) return;
	selection.species = `${build.species.name}|${build.species.source}`;
	selection.class = `${build.class.name}|${build.class.source}`;
	selection.background = `${build.background.name}|${build.background.source}`;
	reflectSelection();
	showSelectionInfo();
}

/** Put the pickers back when the player cancels replacing the open character. */
function revertSelection () {
	selectFrom(currentCharacter);
}

/**
 * Build the character as soon as the three lists name a combination, so the
 * form does not need a separate create action. Replacing an open character
 * discards its choices, so that asks first.
 */
function createFromSelection () {
	const choice = {
		species: readRef(selection.species),
		characterClass: readRef(selection.class),
		background: readRef(selection.background),
	};
	if (!choice.species || !choice.characterClass || !choice.background) return;
	const build = currentCharacter?.build;
	if (build && sameRef(build.species, choice.species) && sameRef(build.class, choice.characterClass) && sameRef(build.background, choice.background)) return;
	if (build && !window.confirm("Changing the species, class, or background starts a new character and clears the choices made for the current one.")) {
		revertSelection();
		return;
	}
	++requestId;
	try {
		editor.create("character", choice);
	} catch (error) {
		showError(`Could not create this character. ${error.message}`);
	}
}

/** Drop the open character and return the form to its empty state. */
function clearCharacter () {
	// Invalidate any pending file read, so a late import cannot restore the
	// character the player just cleared.
	++requestId;
	selection.species = "";
	selection.class = "";
	selection.background = "";
	reflectSelection();
	showSelectionInfo();
	editor?.close();
	currentCharacter = undefined;
	hasPreview = false;
	preview.innerHTML = startPrompt();
	preview.setAttribute("aria-busy", "false");
	characterName.value = "";
	characterName.disabled = true;
	pageCount.textContent = "";
	saveButton.disabled = true;
	printButton.disabled = true;
	printButton.textContent = "Print / Save PDF";
	newCharacterButton.disabled = true;
	document.title = "Character Builder - 5etools";
	status.textContent = STATUS_PROMPT;
	clearError();
}

/** The placeholder shown before the first character is created. */
function startPrompt () {
	return `<section class="cb-page cb-start-note"><h1>Choose a species, class, and background</h1><p>Pick one option in each list; the calculated sheet appears here as soon as all three are chosen, ready to review, print, or save as a PDF.</p></section>`;
}

/** Show the original text of the species, class, and background being chosen. */
function showSelectionInfo () {
	if (!sheetContext) return;
	const read = value => {
		const [name, source] = `${value}`.split("|");
		return name && source ? {name, source} : null;
	};
	for (const [kind, value] of [
		["species", read(selection.species)],
		["class", read(selection.class)],
		["background", read(selection.background)],
	]) {
		const slot = selectionInfo.get(kind);
		if (!slot) continue;
		let info = null;
		if (value) {
			try {
				info = renderSelectionInfo(sheetContext.sources, kind, value);
			} catch (error) {
				showError(`Could not show the ${kind} text. ${error.message}`);
			}
		}
		slot.innerHTML = info ? info.html : "";
		slot.hidden = !info;
	}
}

async function fetchJson (path) {
	const response = await fetch(new URL(path, import.meta.url));
	if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
	return response.json();
}

async function loadData () {
	const currentRequest = ++requestId;
	importInput.disabled = true;
	newCharacterButton.disabled = true;
	saveButton.disabled = true;
	printButton.disabled = true;
	retryButton.hidden = true;
	preview.setAttribute("aria-busy", "true");
	status.textContent = "Loading character data…";
	clearError();
	try {
		const [races, spells, spellLookup, speciesRules, characterSheetRules, fighter, warlock, optionalFeatures, feats, itemMasteries, skills, backgrounds] = await Promise.all([
			fetchJson("../../data/races.json"),
			fetchJson("../../data/spells/spells-xphb.json"),
			fetchJson("../../data/generated/gendata-spell-source-lookup.json"),
			fetchJson("./rules/species.json"),
			fetchJson("./rules/character-sheet.json"),
			fetchJson("../../data/class/class-fighter.json"),
			fetchJson("../../data/class/class-warlock.json"),
			fetchJson("../../data/optionalfeatures.json"),
			fetchJson("../../data/feats.json"),
			fetchJson("../../data/items-base.json"),
			fetchJson("../../data/skills.json"),
			fetchJson("../../data/backgrounds.json"),
		]);
		if (currentRequest !== requestId) return;
		catalog = createSpeciesCatalog({races, spells, rules: speciesRules});
		sheetContext = {rules: characterSheetRules, spells, sources: {races, fighter, warlock, optionalFeatures, feats, itemMasteries, skills, backgrounds, spellLookup, abilityNames: globalThis.Parser.ATB_ABV_TO_FULL}};
		const combinations = getEditorCombinations({catalog, rules: characterSheetRules});
		renderList("species", combinations.species);
		renderList("class", combinations.classes);
		renderList("background", combinations.backgrounds);
		reflectSelection();
		editor = createCharacterEditor({
			container: editorContainer,
			catalog,
			context: sheetContext,
			profiles: createEditorProfiles({catalog, ...sheetContext}),
			onChange: character => {
				try {
					const result = showDocument(character);
					++requestId;
					status.textContent = result === "complete" ? "Character sheet updated." : "Complete the choices in the editor to calculate the full sheet.";
					return true;
				} catch (error) {
					showError(`Could not update the sheet. ${error.message}`);
					return false;
				}
			},
		});
		preview.innerHTML = startPrompt();
		preview.setAttribute("aria-busy", "false");
		importInput.disabled = false;
		newCharacterButton.disabled = true;
		showSelectionInfo();
		status.textContent = STATUS_PROMPT;
	} catch (error) {
		if (currentRequest !== requestId) return;
		preview.setAttribute("aria-busy", "false");
		status.textContent = "Character data could not be loaded.";
		showError(`Reload this page or try again. ${error.message}`);
		retryButton.hidden = false;
	}
}

/** Rename the current character without leaving the page. */
characterName.addEventListener("input", () => {
	characterName.setCustomValidity("");
	if (!currentCharacter) return;
	const name = characterName.value.trim();
	if (!name) return;
	editor?.setName(name);
	try {
		const result = showDocument({...currentCharacter, name});
		status.textContent = result === "complete" ? "Character sheet updated." : "Complete the choices in the editor to calculate the full sheet.";
	} catch (error) {
		showError(`Could not rename this character. ${error.message}`);
	}
});
characterName.addEventListener("change", () => {
	if (characterName.value.trim()) return;
	characterName.setCustomValidity("Enter a character name.");
	characterName.reportValidity();
});

importInput.addEventListener("change", async () => {
	const file = importInput.files[0];
	importInput.value = "";
	if (!file) return;
	const currentRequest = ++requestId;
	printButton.disabled = true;
	status.textContent = "Opening character file…";
	clearError();
	try {
		if (file.size > 1024 * 1024) throw new Error("Choose a JSON file smaller than 1 MB.");
		const text = await file.text();
		if (currentRequest !== requestId) return;
		const character = parseCharacterDocument(text);
		const result = showDocument(character);
		// Importing shows the editor for the opened character, so its choices stay
		// reachable without a separate edit action.
		if (editor?.canEdit(character)) editor.open(character, {autoSelect: false});
		else editor.close();
		selectFrom(character);
		status.textContent = result === "complete" ? `Opened ${file.name}. The character sheet is ready to print.` : `Opened ${file.name}. Complete the listed choices to calculate a full character sheet.`;
	} catch (error) {
		if (currentRequest !== requestId) return;
		status.textContent = hasPreview ? "Your previous preview is unchanged." : "No character is ready to print.";
		showError(`Could not open this character file. ${error.message}`);
	} finally {
		if (currentRequest === requestId) printButton.disabled = !hasPreview;
	}
});

/** Compact print only tightens the layout; every description still prints. */
compactToggle.addEventListener("change", () => {
	preview.classList.toggle("cb-compact", compactToggle.checked);
});
printButton.addEventListener("click", () => {
	if (hasPreview) window.print();
});
retryButton.addEventListener("click", loadData);
newCharacterButton.addEventListener("click", () => {
	if (!hasPreview) return;
	if (!window.confirm("Clear this character? Every choice and note entered for it is discarded.")) return;
	clearCharacter();
});
saveButton.addEventListener("click", () => {
	if (!currentCharacter) return;
	const file = new Blob([serializeCharacterDocument(currentCharacter)], {type: "application/json"});
	const url = URL.createObjectURL(file);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${currentCharacter.id}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
});
loadData();
