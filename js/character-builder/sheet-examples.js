import {validateCharacterDocument} from "./character-document.js";

function classChoices (characterClass, level) {
	const owner = `class:${characterClass.toLowerCase()}|xphb`;
	const fighter = characterClass === "Fighter";
	const choices = [
		{id: `${owner}:skills`, selected: fighter ? ["perception", "survival"] : ["arcana", "intimidation"]},
		{id: `${owner}:equipment`, selected: [fighter ? "fighter-sword-and-shield" : "warlock-pact-mage"]},
	];
	if (level >= 3) choices.push({id: `${owner}:subclass`, selected: [fighter ? "champion|xphb" : "fiend|xphb"]});
	if (level >= 4) {
		choices.push(
			{id: `${owner}:level-4-feat`, selected: ["ability-score-improvement|xphb"]},
			{id: `${owner}:level-4-ability-increases`, selected: [fighter ? "str-1.con-1" : "cha-1.con-1"]},
		);
	}
	if (fighter) {
		return [
			...choices,
			{id: `${owner}:fighting-style`, selected: ["defense|xphb"]},
			{id: `${owner}:weapon-masteries`, selected: ["longsword|xphb", "javelin|xphb", "handaxe|xphb", ...(level >= 4 ? ["flail|xphb"] : [])]},
		];
	}
	const invocations = ["eldritch-mind|xphb", ...(level >= 2 ? ["agonizing-blast|xphb", "armor-of-shadows|xphb"] : []), ...(level >= 5 ? ["devils-sight|xphb", "repelling-blast|xphb"] : [])];
	const prepared = ["spell:armor-of-agathys|xphb", "spell:hex|xphb", ...(level === 2 ? ["spell:charm-person|xphb"] : []), ...(level >= 3 ? ["spell:mirror-image|xphb", "spell:misty-step|xphb"] : []), ...(level === 4 ? ["spell:invisibility|xphb"] : []), ...(level >= 5 ? ["spell:counterspell|xphb", "spell:hunger-of-hadar|xphb"] : [])];
	return [
		...choices,
		{id: `${owner}:invocations`, selected: invocations},
		{id: `${owner}:cantrips`, selected: ["spell:eldritch-blast|xphb", "spell:mind-sliver|xphb", ...(level >= 4 ? ["spell:mage-hand|xphb"] : [])]},
		{id: `${owner}:prepared-spells`, selected: prepared},
		...(level >= 2 ? [{id: `${owner}:agonizing-blast-cantrip`, selected: ["spell:eldritch-blast|xphb"]}] : []),
		...(level >= 5 ? [{id: `${owner}:repelling-blast-cantrip`, selected: ["spell:eldritch-blast|xphb"]}] : []),
		{id: "feat:magic-initiate-cleric|xphb:ability", selected: ["cha"]},
		{id: "feat:magic-initiate-cleric|xphb:cantrips", selected: ["spell:guidance|xphb", "spell:light|xphb"]},
		{id: "feat:magic-initiate-cleric|xphb:spell", selected: ["spell:healing-word|xphb"]},
	];
}

/** Create complete reference build decisions, without saving derived statistics. */
export function createSheetExamples (dataset) {
	return [
		{species: "Gnome", characterClass: "Fighter", lineage: "forest", label: "Forest Gnome"},
		{species: "Tiefling", characterClass: "Warlock", lineage: "infernal", label: "Infernal Tiefling"},
	].flatMap(example => [1, 3, 5].map(level => {
		const owner = `species:${example.species.toLowerCase()}|xphb`;
		const id = `${example.lineage}-${example.species.toLowerCase()}-${example.characterClass.toLowerCase()}-level-${level}`;
		const fighter = example.characterClass === "Fighter";
		const background = fighter ? "Soldier" : "Acolyte";
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
				background: {name: background, source: "XPHB"},
				abilities: {method: "standard", scores: fighter ? {str: 15, dex: 13, con: 14, int: 12, wis: 10, cha: 8} : {str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15}},
				choices: [
					{id: `${owner}:${example.species === "Gnome" ? "lineage" : "legacy"}`, selected: [example.lineage]},
					{id: `${owner}:spellcasting-ability`, selected: [fighter ? "int" : "cha"]},
					...(example.species === "Tiefling" ? [{id: `${owner}:size`, selected: ["medium"]}] : []),
					{id: `background:${background.toLowerCase()}|xphb:ability-increases`, selected: [fighter ? "str-2.con-1" : "cha-2.wis-1"]},
					...(fighter ? [{id: "background:soldier|xphb:tool", selected: ["dice-set|xphb"]}] : []),
					{id: "character:languages", selected: fighter ? ["common", "gnomish", "dwarvish"] : ["common", "draconic", "elvish"]},
					...classChoices(example.characterClass, level),
				],
			},
			session: {hp: {current: null, temporary: 0}, resources: [], notes: ""},
		};
		validateCharacterDocument(document);
		return {id, label: `${example.label} · ${example.characterClass} · Level ${level}`, document};
	}));
}
