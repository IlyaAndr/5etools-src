import {readFileSync} from "node:fs";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const sourceInputs = {
	races: readJson("../../../data/races.json"),
	spells: readJson("../../../data/spells/spells-xphb.json"),
	rules: readJson("../../../js/character-builder/rules/species.json"),
};
const inputs = () => JSON.parse(JSON.stringify(sourceInputs));
const gnome = data => data.races.race.find(species => species.name === "Gnome" && species.source === "XPHB");

describe("Reviewed species catalog", () => {
	it("normalizes only the reviewed 2024 species and their lineages", () => {
		const catalog = createSpeciesCatalog(inputs());
		expect(catalog.species.map(species => species.ref)).toEqual([
			{name: "Dragonborn", source: "XPHB"}, {name: "Dwarf", source: "XPHB"}, {name: "Gnome", source: "XPHB"},
			{name: "Goliath", source: "XPHB"}, {name: "Halfling", source: "XPHB"}, {name: "Orc", source: "XPHB"}, {name: "Tiefling", source: "XPHB"},
		]);
		expect(catalog.species.map(species => species.lineages.map(lineage => lineage.id))).toEqual([
			["acid", "cold", "fire", "lightning", "poison"], [], ["forest", "rock"],
			["clouds-jaunt", "fires-burn", "frosts-chill", "hills-tumble", "stones-endurance", "storms-thunder"], [], [], ["abyssal", "chthonic", "infernal"],
		]);
		expect(catalog.species.filter(species => !species.lineages.length).every(species => species.lineageChoiceId === null && species.abilityChoiceId === null)).toBe(true);
		expect(catalog.species.filter(species => ["Dragonborn", "Goliath"].includes(species.ref.name)).every(species => species.abilityChoiceId === null && species.baseGrants.length === 0 && species.lineages.every(lineage => !lineage.grants.length))).toBe(true);
		expect(catalog.spells).toHaveLength(14);
		expect(catalog.dataset).toEqual(sourceInputs.rules.dataset);
	});

	it("records the fixed species resistances, the hit point bonus, and absent darkvision", () => {
		const catalog = createSpeciesCatalog(inputs());
		const dwarf = catalog.species.find(species => species.ref.name === "Dwarf");
		const halfling = catalog.species.find(species => species.ref.name === "Halfling");
		expect(dwarf.resistances).toEqual(["poison"]);
		expect(dwarf.hpPerLevel).toBe(1);
		expect(dwarf.darkvision).toBe(120);
		expect(halfling.darkvision).toBe(0);
		expect(halfling.hpPerLevel).toBe(0);
		expect(halfling.sizes).toEqual(["small"]);
	});

	it("preserves ritual, casting time, components, and tagged descriptions", () => {
		const catalog = createSpeciesCatalog(inputs());
		const speak = catalog.spells.find(spell => spell.ref.name === "Speak with Animals");
		const rebuke = catalog.spells.find(spell => spell.ref.name === "Hellish Rebuke");
		expect(speak.meta.ritual).toBe(true);
		expect(rebuke.time[0].unit).toBe("reaction");
		expect(rebuke.time[0].condition).toContain("taking damage");
		expect(rebuke.components).toEqual({v: true, s: true});
		expect(rebuke.entries).toEqual(sourceInputs.spells.spell.find(spell => spell.name === "Hellish Rebuke").entries);
		expect(rebuke.entriesHigherLevel[0].name).toBe("Using a Higher-Level Spell Slot");
		expect(catalog.spells.find(spell => spell.ref.name === "Poison Spray").spellAttack).toEqual(["R"]);
		expect(catalog.spells.find(spell => spell.ref.name === "Chill Touch").spellAttack).toEqual(["M"]);
		expect(catalog.spells.find(spell => spell.ref.name === "Ray of Enfeeblement").savingThrow).toEqual(["constitution"]);
		expect(catalog.spells.find(spell => spell.ref.name === "Poison Spray").scalingLevelDice.scaling[5]).toBe("2d12");
	});

	it("uses the verified base darkvision instead of the inconsistent Abyssal version", () => {
		const catalog = createSpeciesCatalog(inputs());
		expect(catalog.species.find(species => species.ref.name === "Tiefling").darkvision).toBe(60);
	});

	it("does not mutate or retain mutable references to source data", () => {
		const data = inputs();
		const before = JSON.stringify(data);
		const catalog = createSpeciesCatalog(data);
		expect(JSON.stringify(data)).toBe(before);
		catalog.species.find(species => species.ref.name === "Gnome").lineages[0].abilityOptions.push("str");
		catalog.spells[0].entries.push("Changed output only");
		catalog.sources[0].title = "Changed output only";
		expect(JSON.stringify(data)).toBe(before);
	});

	it.each([0, 2, "1"])("rejects unsupported annotation version %s", version => {
		const data = inputs();
		data.rules.schemaVersion = version;
		expect(() => createSpeciesCatalog(data)).toThrow("unsupported annotation version");
	});

	it("does not resolve a missing 2024 species to its 2014 namesake", () => {
		const data = inputs();
		data.races.race = data.races.race.filter(species => !(species.name === "Gnome" && species.source === "XPHB"));
		expect(() => createSpeciesCatalog(data)).toThrow("missing species gnome|xphb");
	});

	it("rejects duplicate species and spell references", () => {
		const data = inputs();
		data.races.race.push(JSON.parse(JSON.stringify(gnome(data))));
		expect(() => createSpeciesCatalog(data)).toThrow("duplicate reference gnome|xphb");
		data.races.race.pop();
		data.spells.spell.push(JSON.parse(JSON.stringify(data.spells.spell[0])));
		expect(() => createSpeciesCatalog(data)).toThrow("duplicate reference");
	});

	it("rejects unknown spell references and missing explicit sources", () => {
		const data = inputs();
		gnome(data).additionalSpells[0].known[1][0] = "minor illusion|missing#c";
		expect(() => createSpeciesCatalog(data)).toThrow("unknown spell reference");
		gnome(data).additionalSpells[0].known[1][0] = "minor illusion";
		expect(() => createSpeciesCatalog(data)).toThrow("unsupported spell reference");
	});

	it("rejects leveled spells disguised as known cantrips", () => {
		const data = inputs();
		gnome(data).additionalSpells[0].known[1][0] = "hellish rebuke|xphb#c";
		expect(() => createSpeciesCatalog(data)).toThrow("unsupported spell level");
	});

	it.each([
		data => { gnome(data).additionalSpells[0].will = ["minor illusion|xphb"]; },
		data => { gnome(data).additionalSpells[0].known["_"] = []; },
		data => { gnome(data).additionalSpells[0].innate[1].rest = {}; },
		data => { gnome(data).additionalSpells[0].innate[1].daily.all = ["speak with animals|xphb"]; },
	])("rejects unsupported progression structures instead of losing rules", change => {
		const data = inputs();
		change(data);
		expect(() => createSpeciesCatalog(data)).toThrow(TypeError);
	});

	it("rejects unmapped spell groups and duplicate lineage mappings", () => {
		const data = inputs();
		gnome(data).additionalSpells.push({name: "New Lineage"});
		expect(() => createSpeciesCatalog(data)).toThrow("unmapped spell groups");
		data.races = inputs().races;
		data.rules.species.find(species => species.ref.name === "Gnome").lineages[1].additionalSpellsName = "Forest Gnome";
		expect(() => createSpeciesCatalog(data)).toThrow("duplicate spell group mapping");
	});

	it("rejects resistance mappings that disagree with the source choices", () => {
		const data = inputs();
		data.races.race.find(species => species.name === "Tiefling" && species.source === "XPHB").resist[0].choose.from = ["poison", "necrotic"];
		expect(() => createSpeciesCatalog(data)).toThrow("resistance mapping disagrees");
	});

	it.each(["acid", "fire", null])("rejects extra, duplicate, or malformed resistance option %s", option => {
		const data = inputs();
		data.races.race.find(species => species.name === "Tiefling" && species.source === "XPHB").resist[0].choose.from.push(option);
		expect(() => createSpeciesCatalog(data)).toThrow(TypeError);
	});

	it.each(["toString", "constructor", {}])("rejects inherited or malformed size option %s", size => {
		const data = inputs();
		gnome(data).size = [size];
		expect(() => createSpeciesCatalog(data)).toThrow("unsupported size options");
	});

	it.each(["time", "range", "duration", "components"])("rejects missing important spell metadata %s", field => {
		const data = inputs();
		delete data.spells.spell.find(spell => spell.name === "Hellish Rebuke")[field];
		expect(() => createSpeciesCatalog(data)).toThrow(`.${field}`);
	});

	it("rejects an unverified common spell instead of granting a lineage spell to everyone", () => {
		const data = inputs();
		data.rules.species[1].commonSpells.push("fire bolt|xphb");
		expect(() => createSpeciesCatalog(data)).toThrow("not consistently granted");
	});
});
