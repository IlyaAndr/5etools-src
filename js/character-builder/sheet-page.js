import {parseCharacterDocument, serializeCharacterDocument} from "./character-document.js";
import {createSpeciesCatalog} from "./species-catalog.js";
import {renderCharacterSheet} from "./sheet-renderer.js";
import {createCharacterSheetModel} from "./character-sheet-model.js";
import {createSheetExamples} from "./sheet-examples.js";
import {createFighterEditor} from "./fighter-editor.js";

const exampleSelect = document.getElementById("example-select");
const importInput = document.getElementById("character-import");
const printButton = document.getElementById("print-sheet");
const status = document.getElementById("status");
const errorMessage = document.getElementById("error-message");
const retryButton = document.getElementById("retry-load");
const preview = document.getElementById("sheet-preview");
const newFighterButton = document.getElementById("new-fighter");
const editFighterButton = document.getElementById("edit-fighter");
const saveButton = document.getElementById("save-character");
const editorContainer = document.getElementById("fighter-editor");

let catalog;
let sheetContext;
let examples = [];
let selectedExample = "";
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

function showDocument (character, exampleId = "") {
	const model = createCharacterSheetModel(character, catalog, sheetContext);
	const html = renderCharacterSheet(model, catalog);
	preview.innerHTML = html;
	document.title = `${character.name} — Character Builder`;
	selectedExample = exampleId;
	currentCharacter = character;
	exampleSelect.value = exampleId;
	hasPreview = true;
	printButton.disabled = false;
	saveButton.disabled = false;
	editFighterButton.disabled = !editor?.canEdit(character);
	printButton.textContent = model.status === "complete" ? "Print / Save PDF" : "Print draft summary";
	preview.setAttribute("aria-busy", "false");
	clearError();
	return model.status;
}

async function fetchJson (path) {
	const response = await fetch(new URL(path, import.meta.url));
	if (!response.ok) throw new Error(`Data request failed (${response.status}).`);
	return response.json();
}

async function loadData () {
	const currentRequest = ++requestId;
	exampleSelect.disabled = true;
	importInput.disabled = true;
	newFighterButton.disabled = true;
	editFighterButton.disabled = true;
	saveButton.disabled = true;
	printButton.disabled = true;
	retryButton.hidden = true;
	preview.setAttribute("aria-busy", "true");
	status.textContent = "Loading character data…";
	clearError();
	try {
		const [races, spells, speciesRules, characterSheetRules, fighter, warlock, optionalFeatures, feats, itemMasteries, skills, backgrounds] = await Promise.all([
			fetchJson("../../data/races.json"),
			fetchJson("../../data/spells/spells-xphb.json"),
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
		sheetContext = {rules: characterSheetRules, spells, sources: {races, fighter, warlock, optionalFeatures, feats, itemMasteries, skills, backgrounds, abilityNames: globalThis.Parser.ATB_ABV_TO_FULL}};
		editor = createFighterEditor({
			container: editorContainer,
			catalog,
			context: sheetContext,
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
		examples = createSheetExamples(catalog.dataset);
		const importedOption = new Option("Current character", "");
		importedOption.disabled = true;
		exampleSelect.replaceChildren(importedOption);
		for (const example of examples) exampleSelect.add(new Option(example.label, example.id));
		showDocument(examples[0].document, examples[0].id);
		exampleSelect.disabled = false;
		importInput.disabled = false;
		newFighterButton.disabled = false;
		status.textContent = "Reference character ready. Choose another example or open a saved character.";
	} catch (error) {
		if (currentRequest !== requestId) return;
		preview.setAttribute("aria-busy", "false");
		status.textContent = "Character data could not be loaded.";
		showError(`Reload this page or try again. ${error.message}`);
		retryButton.hidden = false;
	}
}

exampleSelect.addEventListener("change", () => {
	const example = examples.find(candidate => candidate.id === exampleSelect.value);
	if (!example) {
		exampleSelect.value = selectedExample;
		return;
	}
	++requestId;
	try {
		const result = showDocument(example.document, example.id);
		editor.close();
		status.textContent = result === "complete" ? `${example.label} is ready to preview and print.` : "This draft needs the choices listed below before a full sheet can be calculated.";
	} catch (error) {
		exampleSelect.value = selectedExample;
		printButton.disabled = !hasPreview;
		showError(`Could not open this example. ${error.message}`);
	}
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

printButton.addEventListener("click", () => {
	if (hasPreview) window.print();
});
retryButton.addEventListener("click", loadData);
newFighterButton.addEventListener("click", () => {
	++requestId;
	editor.create();
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
