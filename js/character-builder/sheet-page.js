import {parseCharacterDocument, serializeCharacterDocument} from "./character-document.js";
import {createSpeciesCatalog} from "./species-catalog.js";
import {escapeHtml, renderCharacterSheet} from "./sheet-renderer.js";
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
const editFighterButton = document.getElementById("edit-fighter");
const saveButton = document.getElementById("save-character");
const editorContainer = document.getElementById("fighter-editor");
const selectionInfo = document.getElementById("new-character-info");
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
	editFighterButton.disabled = !editor?.canEdit(character);
	printButton.textContent = model.status === "complete" ? "Print / Save PDF" : "Print draft summary";
	preview.setAttribute("aria-busy", "false");
	clearError();
	return model.status;
}

/** Render one picker list; clicking an option becomes the current selection. */
function renderList (kind, entries) {
	listElements[kind].replaceChildren(...entries.map(entry => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "cb-picker__option";
		button.textContent = entry.name;
		button.dataset.value = `${entry.name}|${entry.source}`;
		button.setAttribute("role", "option");
		button.addEventListener("click", () => {
			selection[kind] = button.dataset.value;
			reflectSelection();
			showSelectionInfo();
		});
		return button;
	}));
}

/** Mark the selected option in each list, so the choice is visible at a glance. */
function reflectSelection () {
	for (const [kind, container] of Object.entries(listElements)) {
		for (const button of container.children) {
			const active = button.dataset.value === selection[kind];
			button.classList.toggle("is-selected", active);
			button.setAttribute("aria-selected", `${active}`);
		}
	}
}

/** The placeholder shown before the first character is created. */
function startPrompt () {
	return `<section class="cb-page cb-start-note"><h1>Choose a species, class, and background</h1><p>Pick one option in each list, then select <strong>New character</strong>. The calculated sheet appears here, ready to review, print, or save as a PDF.</p></section>`;
}

/** Show the original text of the species, class, and background being chosen. */
function showSelectionInfo () {
	if (!sheetContext) return;
	const read = value => {
		const [name, source] = `${value}`.split("|");
		return name && source ? {name, source} : null;
	};
	const sections = [
		["species", "Species", read(selection.species)],
		["class", "Class", read(selection.class)],
		["background", "Background", read(selection.background)],
	].map(([kind, label, selection]) => {
		if (!selection) return "";
		let info = null;
		try {
			info = renderSelectionInfo(sheetContext.sources, kind, selection);
		} catch (error) {
			showError(`Could not show the ${kind} text. ${error.message}`);
			return "";
		}
		if (!info) return "";
		return `<details class="cb-selection-info__entry" open data-info="${kind}"><summary>${label}: <strong>${escapeHtml(info.name)}</strong></summary><div class="cb-selection-info__text">${info.html}</div></details>`;
	}).join("");
	selectionInfo.innerHTML = sections;
	selectionInfo.hidden = !sections;
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
	editFighterButton.disabled = true;
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
		selection.species = `${combinations.species[0].name}|${combinations.species[0].source}`;
		selection.class = `${combinations.classes[0].name}|${combinations.classes[0].source}`;
		selection.background = `${combinations.backgrounds[0].name}|${combinations.backgrounds[0].source}`;
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
		newCharacterButton.disabled = false;
		showSelectionInfo();
		status.textContent = "Choose a species, class, and background, then select New character.";
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
		editor.close();
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
	const readRef = value => {
		const [name, source] = value.split("|");
		return {name, source};
	};
	++requestId;
	try {
		editor.create("character", {
			species: readRef(selection.species),
			characterClass: readRef(selection.class),
			background: readRef(selection.background),
		});
	} catch (error) {
		showError(`Could not create this character. ${error.message}`);
	}
});
editFighterButton.addEventListener("click", () => editor.open(currentCharacter));
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
