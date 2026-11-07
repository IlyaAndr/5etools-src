import {readFileSync} from "node:fs";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {projectSpecies} from "../../../js/character-builder/species-projection.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const references = readJson("../../fixtures/character-builder/species-reference-cases.json");
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells: readJson("../../../data/spells/spells-xphb.json"),
	rules: readJson("../../../js/character-builder/rules/species.json"),
});

describe("Primary-rule species reference cases", () => {
	it.each(references.cases)("matches $id", reference => {
		const document = readJson(`../../fixtures/character-builder/${reference.fixture}.json`);
		document.build.level = reference.level;
		const owner = `species:${document.build.species.name.toLowerCase()}|xphb`;
		const lineageKey = document.build.species.name === "Gnome" ? "lineage" : "legacy";
		document.build.choices = [
			{id: `${owner}:${lineageKey}`, selected: [reference.lineage]},
			{id: `${owner}:spellcasting-ability`, selected: [reference.spellcastingAbility]},
		];
		if (document.build.species.name === "Tiefling") document.build.choices.push({id: `${owner}:size`, selected: [reference.size]});
		const projection = projectSpecies(document, catalog);
		const leveledSpells = projection.spells
			.filter(spell => spell.level > 0)
			.map(spell => {
				const resource = projection.resources.find(it => it.id === spell.resourceId);
				return {
					name: spell.ref.name,
					level: spell.level,
					maxFreeUses: resource?.maxUses,
					reset: resource?.reset,
					alwaysPrepared: spell.alwaysPrepared,
					canCastWithSlots: spell.canCastWithSlots,
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));

		expect({
			proficiencyBonus: projection.proficiencyBonus,
			size: projection.size,
			speed: projection.speed,
			darkvision: projection.darkvision,
			savingThrowAdvantages: projection.savingThrowAdvantages.map(it => it.ability).sort(),
			resistances: [...projection.resistances].sort(),
			spellcastingAbility: projection.spellcastingAbility,
			cantrips: projection.spells.filter(spell => spell.level === 0).map(spell => spell.ref.name).sort(),
			leveledSpells,
			unresolvedChoiceCount: projection.unresolvedChoices.length,
		}).toEqual(reference.expected);
		expect(projection.coverage).toBe("species-only");
		expect(projection.savingThrowAdvantages.every(it => it.condition === null)).toBe(true);
		expect(projection.resources).toHaveLength(leveledSpells.length);
		expect(new Set(projection.resources.map(resource => resource.id)).size).toBe(projection.resources.length);
		expect(projection.spells.every(spell => spell.ref.source === "XPHB")).toBe(true);
		expect(projection.spells.filter(spell => spell.level === 0).every(spell => spell.resourceId === null)).toBe(true);
	});
});
