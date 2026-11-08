import {validateCharacterDocument} from "./character-document.js";

/** Create fresh preview drafts using the catalog's source dataset pin. */
export function createSheetExamples (dataset) {
	return [
		{species: "Gnome", characterClass: "Fighter", lineage: "forest", label: "Forest Gnome"},
		{species: "Tiefling", characterClass: "Warlock", lineage: "infernal", label: "Infernal Tiefling"},
	].flatMap(example => [1, 3, 5].map(level => {
		const owner = `species:${example.species.toLowerCase()}|xphb`;
		const id = `${example.lineage}-${example.species.toLowerCase()}-${example.characterClass.toLowerCase()}-level-${level}`;
		const document = {
			schemaVersion: 1,
			id,
			name: `${example.label} ${example.characterClass}`,
			status: "draft",
			ruleset: "2024",
			dataset: {...dataset},
			build: {
				level,
				class: {name: example.characterClass, source: "XPHB"},
				species: {name: example.species, source: "XPHB"},
				background: null,
				abilities: {method: "standard", scores: null},
				choices: [
					{id: `${owner}:${example.species === "Gnome" ? "lineage" : "legacy"}`, selected: [example.lineage]},
					{id: `${owner}:spellcasting-ability`, selected: ["int"]},
					...(example.species === "Tiefling" ? [{id: `${owner}:size`, selected: ["medium"]}] : []),
				],
			},
			session: {hp: {current: null, temporary: 0}, resources: [], notes: ""},
		};
		validateCharacterDocument(document);
		return {id, label: `${example.label} · ${example.characterClass} · Level ${level}`, document};
	}));
}
