import {readFileSync} from "node:fs";
import {createSpellCatalog, filterSpellOptions, getSpellQueryOptions, resolveSpellCatalog, selectSpells} from "../../../js/character-builder/spell-catalog.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const lookup = readJson("../../../data/generated/gendata-spell-source-lookup.json");
const clone = value => JSON.parse(JSON.stringify(value));
const catalog = () => createSpellCatalog({spells, lookup});
const names = query => selectSpells(catalog(), query).map(spell => spell.name);

const Warlock_CANTRIPS = ["Blade Ward", "Chill Touch", "Eldritch Blast", "Friends", "Mage Hand", "Mind Sliver", "Minor Illusion", "Poison Spray", "Prestidigitation", "Thunderclap", "Toll the Dead", "True Strike"];
const Warlock_LEVEL_1 = ["Armor of Agathys", "Arms of Hadar", "Bane", "Charm Person", "Comprehend Languages", "Detect Magic", "Expeditious Retreat", "Hellish Rebuke", "Hex", "Illusory Script", "Protection from Evil and Good", "Speak with Animals", "Tasha's Hideous Laughter", "Unseen Servant", "Witch Bolt"];

describe("Reviewed spell catalog", () => {
	it("indexes every XPHB spell once in level-then-name order", () => {
		const built = catalog();
		expect(built.spells).toHaveLength(spells.spell.length);
		expect(new Set(built.spells.map(spell => spell.id)).size).toBe(built.spells.length);
		for (let index = 1; index < built.spells.length; index++) {
			const [left, right] = [built.spells[index - 1], built.spells[index]];
			expect(left.level < right.level || (left.level === right.level && left.name.localeCompare(right.name) <= 0)).toBe(true);
		}
	});

	it("evaluates the Warlock cantrip filter the rules used to copy by hand", () => {
		const matches = selectSpells(catalog(), "level=0|class=Warlock");
		expect(matches.map(spell => spell.name)).toEqual(Warlock_CANTRIPS);
		expect(matches.every(spell => spell.level === 0)).toBe(true);
		expect(matches.every(spell => spell.classes.some(entry => entry.name === "Warlock"))).toBe(true);
	});

	it("evaluates the Warlock first-level filter against the pinned data", () => {
		const matches = selectSpells(catalog(), "level=1|class=Warlock");
		expect(matches.map(spell => spell.name)).toEqual(Warlock_LEVEL_1);
		expect(matches.every(spell => spell.level === 1)).toBe(true);
	});

	it("evaluates the Magic Initiate (Cleric) filters from the feat record", () => {
		expect(names("level=0|class=Cleric")).toEqual(["Guidance", "Light", "Mending", "Resistance", "Sacred Flame", "Spare the Dying", "Thaumaturgy", "Toll the Dead", "Word of Radiance"]);
		expect(selectSpells(catalog(), "level=1|class=Cleric")).toHaveLength(15);
	});

	it("combines level, school, ritual, and concentration terms", () => {
		expect(names("level=0|class=Wizard|school=Evocation")).toEqual(["Acid Splash", "Fire Bolt", "Light", "Ray of Frost", "Shocking Grasp", "Thunderclap"]);
		const rituals = selectSpells(catalog(), "level=1|class=Warlock|components & miscellaneous=ritual");
		expect(rituals.map(spell => spell.name)).toEqual(["Comprehend Languages", "Detect Magic", "Illusory Script", "Speak with Animals", "Unseen Servant"]);
		expect(rituals.every(spell => spell.ritual)).toBe(true);
		expect(selectSpells(catalog(), "level=1|class=Warlock|concentration=true").every(spell => spell.concentration)).toBe(true);
		expect(selectSpells(catalog(), "level=1|class=Warlock|concentration=false").every(spell => !spell.concentration)).toBe(true);
	});

	it("supports level negation and multiple values", () => {
		expect(selectSpells(catalog(), "level=!0|class=Warlock").every(spell => spell.level >= 1)).toBe(true);
		expect(selectSpells(catalog(), "level=0;1|class=Cleric")).toHaveLength(names("level=0|class=Cleric").length + names("level=1|class=Cleric").length);
	});

	it("counts only a plain true membership, skipping variant definers", () => {
		const warlockSpells = spells.spell.filter(spell => lookup[spell.source.toLowerCase()]?.[spell.name.toLowerCase()]?.class?.XPHB?.Warlock === true);
		expect(selectSpells(catalog(), "class=Warlock")).toHaveLength(warlockSpells.length);
		expect(catalog().byId.get("spell:eldritch-blast|xphb").classes).toEqual([{name: "Warlock", source: "XPHB"}]);
	});

	it.each([
		["missing data", () => undefined],
		["empty spell list", data => ({spell: []})],
		["invalid spell level", data => { data.spell[0].level = 10; return data; }],
		["invalid school", data => { data.spell[0].school = "X"; return data; }],
		["missing name", data => { data.spell[0].name = ""; return data; }],
		["duplicate spell", data => { data.spell.push({...data.spell[0]}); return data; }],
	])(`rejects %s`, (_label, change) => {
		expect(() => createSpellCatalog({spells: change(clone(spells)), lookup})).toThrow(TypeError);
	});

	it("rejects a missing class lookup", () => {
		expect(() => createSpellCatalog({spells: spells.spell})).toThrow(TypeError);
	});

	it.each([
		"",
		"level=10|class=Warlock",
		"school=Bogus|class=Warlock",
		"components & miscellaneous=bogus|class=Warlock",
		"class=Warlock|unsupported",
	])("rejects the unsupported filter %j instead of widening it", query => {
		expect(() => selectSpells(catalog(), query)).toThrow(TypeError);
	});
});

describe("Spell option filtering", () => {
	it("names spells without replacing their display name and adds a level/school hint", () => {
		const options = getSpellQueryOptions(catalog(), "level=0|class=Warlock");
		expect(options[2]).toMatchObject({id: "spell:eldritch-blast|xphb", label: "Eldritch Blast", detail: "Cantrip, Evocation"});
	});

	it("narrows options with the site's filter vocabulary plus free text", () => {
		const cantrips = getSpellQueryOptions(catalog(), "level=0|class=Warlock");
		expect(filterSpellOptions(cantrips, "blast").map(option => option.id)).toEqual(["spell:eldritch-blast|xphb"]);
		expect(filterSpellOptions(cantrips, "level=0 blast").map(option => option.id)).toEqual(["spell:eldritch-blast|xphb"]);
		expect(filterSpellOptions(cantrips, "level=0|class=Warlock")).toEqual(cantrips);
		expect(filterSpellOptions(cantrips, "ritual")).toEqual([]);
		expect(filterSpellOptions(cantrips, "")).toBe(cantrips);
	});

	it("applies every token so an unknown filter term matches nothing", () => {
		const firstLevel = getSpellQueryOptions(catalog(), "level=1|class=Warlock");
		expect(filterSpellOptions(firstLevel, "concentration").every(option => option.spell.concentration)).toBe(true);
		expect(filterSpellOptions(firstLevel, "level=0")).toEqual([]);
		expect(filterSpellOptions(firstLevel, "school=Evocation").every(option => option.spell.school === "V")).toBe(true);
		expect(filterSpellOptions(firstLevel, "nosuchterm")).toEqual([]);
	});
});

describe("Spell catalog resolution", () => {
	it("prefers a prepared catalog, builds one from loaded files, and reports absent data", () => {
		const built = catalog();
		expect(resolveSpellCatalog({spellCatalog: built})).toBe(built);
		expect(resolveSpellCatalog({spells, sources: {spellLookup: lookup}}).spells).toHaveLength(spells.spell.length);
		expect(resolveSpellCatalog({spells, sources: {spellLookup: lookup}})).toBe(resolveSpellCatalog({spells, sources: {spellLookup: lookup}}));
		expect(resolveSpellCatalog({spells: undefined, sources: {spellLookup: lookup}})).toBeNull();
		expect(resolveSpellCatalog({spells, sources: {}})).toBeNull();
		expect(() => resolveSpellCatalog({spells: [], sources: {spellLookup: lookup}})).toThrow(TypeError);
	});
});
