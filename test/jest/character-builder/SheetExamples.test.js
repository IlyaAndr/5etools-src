import {readFileSync} from "node:fs";
import {validateCharacterDocument} from "../../../js/character-builder/character-document.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {projectSpecies} from "../../../js/character-builder/species-projection.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells: readJson("../../../data/spells/spells-xphb.json"),
	rules: readJson("../../../js/character-builder/rules/species.json"),
});

describe("Browser preview examples", () => {
	it("creates six valid drafts with complete species choices at levels 1, 3, and 5", () => {
		const examples = createSheetExamples(catalog.dataset);
		expect(examples).toHaveLength(6);
		expect(new Set(examples.map(example => example.id)).size).toBe(6);
		expect(examples.map(example => example.document.build.level)).toEqual([1, 3, 5, 1, 3, 5]);
		for (const example of examples) {
			expect(validateCharacterDocument(example.document)).toBe(true);
			expect(projectSpecies(example.document, catalog).unresolvedChoices).toEqual([]);
			expect(example.document.build.abilities.scores).toBe(null);
			expect(example.document.session.resources).toEqual([]);
		}
	});

	it("keeps documents independent of each other and the source dataset", () => {
		const originalDataset = JSON.stringify(catalog.dataset);
		const examples = createSheetExamples(catalog.dataset);
		examples[0].document.dataset.version = "changed";
		examples[0].document.build.choices[0].selected[0] = "rock";
		examples[0].document.session.notes = "Changed this example only";
		expect(JSON.stringify(catalog.dataset)).toBe(originalDataset);
		expect(examples[1].document.build.choices[0].selected).toEqual(["forest"]);
		expect(examples[1].document.session.notes).toBe("");
		expect(createSheetExamples(catalog.dataset)[0].document.build.choices[0].selected).toEqual(["forest"]);
	});

	it("rejects invalid dataset metadata instead of making unusable examples", () => {
		expect(() => createSheetExamples({...catalog.dataset, revision: "unknown"})).toThrow("character.dataset.revision");
	});
});
