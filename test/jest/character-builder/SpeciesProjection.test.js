import {readFileSync} from "node:fs";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {projectSpecies} from "../../../js/character-builder/species-projection.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells: readJson("../../../data/spells/spells-xphb.json"),
	rules: readJson("../../../js/character-builder/rules/species.json"),
});

function character (species, lineage, level = 5) {
	const isGnome = species === "Gnome";
	const document = readJson(`../../fixtures/character-builder/${isGnome ? "gnome-fighter" : "tiefling-warlock"}-draft.json`);
	const owner = `species:${species.toLowerCase()}|xphb`;
	document.build.level = level;
	document.build.choices = [
		{id: `${owner}:${isGnome ? "lineage" : "legacy"}`, selected: [lineage]},
		{id: `${owner}:spellcasting-ability`, selected: ["int"]},
	];
	if (!isGnome) document.build.choices.push({id: `${owner}:size`, selected: ["medium"]});
	return document;
}

describe("Species-only sheet contributions", () => {
	it.each([
		["Gnome", "forest", ["Minor Illusion", "Speak with Animals"], []],
		["Gnome", "rock", ["Mending", "Prestidigitation"], []],
		["Tiefling", "abyssal", ["Hold Person", "Poison Spray", "Ray of Sickness", "Thaumaturgy"], ["poison"]],
		["Tiefling", "chthonic", ["Chill Touch", "False Life", "Ray of Enfeeblement", "Thaumaturgy"], ["necrotic"]],
		["Tiefling", "infernal", ["Darkness", "Fire Bolt", "Hellish Rebuke", "Thaumaturgy"], ["fire"]],
	])("projects %s / %s with linked spells and resistance", (species, lineage, spellNames, resistances) => {
		const projection = projectSpecies(character(species, lineage), catalog);
		expect(projection.spells.map(spell => spell.ref.name).sort()).toEqual(spellNames);
		expect(projection.resistances).toEqual(resistances);
		expect(projection.unresolvedChoices).toEqual([]);
		expect(projection.coverage).toBe("species-only");
		expect(projection.spells.every(spell => spell.ability === "int")).toBe(true);
	});

	it("projects Gnomish Cunning independently of class and proficiency", () => {
		const fighter = character("Gnome", "forest");
		const warlock = JSON.parse(JSON.stringify(fighter));
		warlock.build.class = {name: "Warlock", source: "XPHB"};
		const projection = projectSpecies(fighter, catalog);
		expect(projectSpecies(warlock, catalog)).toEqual(projection);
		expect(projection.savingThrowAdvantages).toEqual([
			{ability: "int", condition: null, feature: "Gnomish Cunning"},
			{ability: "wis", condition: null, feature: "Gnomish Cunning"},
			{ability: "cha", condition: null, feature: "Gnomish Cunning"},
		]);
		expect(projection).not.toHaveProperty("savingThrowBonuses");
	});

	it.each([[1, 2], [3, 2], [5, 3]])("gives the Forest Gnome PB free uses at level %s", (level, maxUses) => {
		const projection = projectSpecies(character("Gnome", "forest", level), catalog);
		expect(projection.resources).toEqual([{
			id: "species:gnome|xphb:forest:speak-with-animals", spellId: "spell:speak-with-animals|xphb", maxUses, reset: "long",
		}]);
		expect(projection.spells.find(spell => spell.ref.name === "Speak with Animals")).toMatchObject({alwaysPrepared: true, canCastWithSlots: true, ritual: true});
	});

	it.each([[1, 0], [3, 1], [5, 2]])("unlocks independent Infernal free uses at level %s", (level, count) => {
		const document = character("Tiefling", "infernal", level);
		document.build.class = {name: "Fighter", source: "XPHB"};
		const projection = projectSpecies(document, catalog);
		expect(projection.resources).toHaveLength(count);
		expect(projection.resources.every(resource => resource.maxUses === 1 && resource.reset === "long")).toBe(true);
		expect(new Set(projection.resources.map(resource => resource.id)).size).toBe(count);
		expect(projection.spells.filter(spell => spell.level === 0).every(spell => spell.resourceId === null)).toBe(true);
	});

	it("keeps pending choices explicit and still grants independent Otherworldly Presence", () => {
		const document = character("Tiefling", "infernal");
		document.build.choices = [];
		const projection = projectSpecies(document, catalog);
		expect(projection.size).toBe(null);
		expect(projection.spellcastingAbility).toBe(null);
		expect(projection.resistances).toEqual([]);
		expect(projection.resources).toEqual([]);
		expect(projection.spells.map(spell => spell.ref.name)).toEqual(["Thaumaturgy"]);
		expect(projection.spells[0].ability).toBe(null);
		expect(projection.unresolvedChoices.map(choice => choice.id)).toEqual([
			"species:tiefling|xphb:legacy", "species:tiefling|xphb:spellcasting-ability", "species:tiefling|xphb:size",
		]);
	});

	it("does not substitute class ability or draft base scores for a missing species ability", () => {
		const document = character("Tiefling", "infernal");
		document.build.choices = document.build.choices.filter(choice => !choice.id.endsWith("spellcasting-ability"));
		const projection = projectSpecies(document, catalog);
		expect(projection.spells.every(spell => spell.ability === null)).toBe(true);
		expect(projection).not.toHaveProperty("spellSaveDc");
		expect(projection).not.toHaveProperty("spellAttackBonus");
	});

	it.each([
		["species:tiefling|xphb:legacy", ["forest"]],
		["species:tiefling|xphb:legacy", ["infernal", "abyssal"]],
		["species:tiefling|xphb:spellcasting-ability", ["str"]],
		["species:tiefling|xphb:size", ["large"]],
		["species:tiefling|xphb:unknown", ["infernal"]],
	])("rejects invalid species choice %s", (id, selected) => {
		const document = character("Tiefling", "infernal");
		document.build.choices = document.build.choices.filter(choice => choice.id !== id);
		document.build.choices.push({id, selected});
		expect(() => projectSpecies(document, catalog)).toThrow("character.build.choices");
	});

	it("removes old lineage contributions when a legacy changes", () => {
		const document = character("Tiefling", "infernal");
		const first = projectSpecies(document, catalog);
		document.build.choices[0].selected = ["abyssal"];
		const next = projectSpecies(document, catalog);
		expect(first.resistances).toEqual(["fire"]);
		expect(next.resistances).toEqual(["poison"]);
		expect(next.spells.some(spell => ["Darkness", "Hellish Rebuke", "Fire Bolt"].includes(spell.ref.name))).toBe(false);
		expect(next.resources.some(resource => resource.id.includes(":infernal:"))).toBe(false);
	});

	it("does not change session marks or retain references to character/catalog objects", () => {
		const document = character("Tiefling", "infernal");
		const documentBefore = JSON.stringify(document);
		const catalogBefore = JSON.stringify(catalog);
		const projection = projectSpecies(document, catalog);
		expect(projection.resources.some(resource => Object.hasOwn(resource, "spent"))).toBe(false);
		projection.spells[0].ref.name = "Changed output only";
		projection.resistances.push("cold");
		expect(JSON.stringify(document)).toBe(documentBefore);
		expect(JSON.stringify(catalog)).toBe(catalogBefore);
	});

	it("does not add an invented spell-use resource or abbreviated reminder for Rock Gnome devices", () => {
		const projection = projectSpecies(character("Gnome", "rock"), catalog);
		expect(projection.resources).toEqual([]);
		expect(projection.notes).toEqual([]);
	});

	it.each(["id", "version", "revision"])("rejects a mismatched pinned dataset %s", field => {
		const document = character("Gnome", "forest");
		const differentCatalog = {...catalog, dataset: {...catalog.dataset, [field]: "different"}};
		expect(() => projectSpecies(document, differentCatalog)).toThrow("catalog.dataset");
	});

	it("rejects unsupported editions and unavailable species references", () => {
		const document = character("Gnome", "forest");
		document.build.species.source = "PHB";
		expect(() => projectSpecies(document, catalog)).toThrow("unsupported or ambiguous species");
		document.build.species = {name: "Elf", source: "XPHB"};
		expect(() => projectSpecies(document, catalog)).toThrow("unsupported or ambiguous species");
	});
});
