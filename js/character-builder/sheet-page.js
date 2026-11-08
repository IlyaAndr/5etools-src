import {parseCharacterDocument} from "./character-document.js";
import {createSpeciesCatalog} from "./species-catalog.js";
import {renderSpeciesSheet} from "./sheet-renderer.js";
import {createSheetExamples} from "./sheet-examples.js";

const exampleSelect = document.getElementById("example-select");
const importInput = document.getElementById("character-import");
const printButton = document.getElementById("print-sheet");
const status = document.getElementById("status");
const errorMessage = document.getElementById("error-message");
const retryButton = document.getElementById("retry-load");
const preview = document.getElementById("sheet-preview");

let catalog;
let examples = [];
let selectedExample = "";
let hasPreview = false;
let requestId = 0;

function clearError () {
	errorMessage.hidden = true;
	errorMessage.textContent = "";
}

function showError (message) {
	errorMessage.textContent = message;
	errorMessage.hidden = false;
}

function showDocument (character, exampleId = "") {
	const html = renderSpeciesSheet(character, catalog);
	preview.innerHTML = html;
	document.title = `${character.name} — Character Builder`;
	selectedExample = exampleId;
	exampleSelect.value = exampleId;
	hasPreview = true;
	printButton.disabled = false;
	preview.setAttribute("aria-busy", "false");
	clearError();
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
	printButton.disabled = true;
	retryButton.hidden = true;
	preview.setAttribute("aria-busy", "true");
	status.textContent = "Loading character data…";
	clearError();
	try {
		const [races, spells, rules] = await Promise.all([
			fetchJson("../../data/races.json"),
			fetchJson("../../data/spells/spells-xphb.json"),
			fetchJson("./rules/species.json"),
		]);
		if (currentRequest !== requestId) return;
		catalog = createSpeciesCatalog({races, spells, rules});
		examples = createSheetExamples(catalog.dataset);
		const importedOption = new Option("Imported character", "");
		importedOption.disabled = true;
		exampleSelect.replaceChildren(importedOption);
		for (const example of examples) exampleSelect.add(new Option(example.label, example.id));
		showDocument(examples[0].document, examples[0].id);
		exampleSelect.disabled = false;
		importInput.disabled = false;
		status.textContent = "Example ready. You can choose another example or open a saved character.";
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
		showDocument(example.document, example.id);
		status.textContent = `${example.label} is ready to preview and print.`;
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
		showDocument(character);
		status.textContent = `Opened ${file.name}. The draft preview is ready to print.`;
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
loadData();
