import {readFileSync} from "node:fs";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const sources = {
	races: readJson("../../../data/races.json"),
	fighter: readJson("../../../data/class/class-fighter.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
};
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells,
	rules: readJson("../../../js/character-builder/rules/species.json"),
});
const context = {rules: readJson("../../../js/character-builder/rules/character-sheet.json"), spells, sources};
const references = readJson("../../fixtures/character-builder/complete-reference-cases.json");
const examples = createSheetExamples(catalog.dataset);

function castingValues (source) {
	return source ? {ability: source.ability, attack: source.attack, dc: source.dc} : null;
}

describe("Audited complete reference character values", () => {
	it.each(references.cases)("calculates $id from build decisions", reference => {
		const example = examples.find(value => value.id === reference.id);
		const model = createCharacterSheetModel(example.document, catalog, context);
		expect(model.status).toBe("complete");
		expect(model.issues).toEqual([]);
		const attack = model.attacks[0];
		expect({
			scores: Object.fromEntries(model.abilities.map(ability => [ability.id, ability.score])),
			saves: Object.fromEntries(model.abilities.map(ability => [ability.id, ability.save])),
			maximumHp: model.hp.maximum,
			armorClass: model.armorClass.value,
			armorFallback: model.armorClass.fallback,
			initiative: model.initiative.value,
			initiativeAdvantage: model.initiative.advantage,
			passives: model.passives,
			primaryAttack: {name: attack.name, toHit: attack.toHit, damage: attack.damage, count: attack.count},
			speciesCasting: castingValues(model.spellcasting.find(source => source.id.startsWith("species:"))),
			classCasting: castingValues(model.spellcasting.find(source => source.id.startsWith("class:"))),
			spellCount: model.spells.length,
			resources: Object.fromEntries(model.resources.map(resource => [resource.id, resource.maxUses])),
			concentration: model.concentration,
		}).toEqual(reference.expected);
		expect(model.abilities.flatMap(ability => ability.skills)).toHaveLength(18);
		expect(model.abilities.flatMap(ability => ability.skills).filter(skill => skill.proficient)).toHaveLength(4);
		if (model.armorClass.fallback !== null) expect(model.armorClass.condition).toMatch(/Mage Armor.*no armor/);
		if (model.className === "Fighter") {
			const wind = model.resources.find(resource => resource.name === "Second Wind");
			expect(wind.recovery).toEqual({short: 1, long: "all"});
			expect(wind.healing).toEqual({dice: "1d10", modifier: example.document.build.level});
		} else {
			const feat = model.spellcasting.find(source => source.id.startsWith("feat:"));
			expect(castingValues(feat)).toEqual(reference.expected.classCasting);
		}
	});
});
