import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import "../../../js/utils.js";
import "../../../js/render.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {renderCharacterSheet} from "../../../js/character-builder/sheet-renderer.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const spells = readJson("../../../data/spells/spells-xphb.json");
const sources = {
	skills: readJson("../../../data/skills.json"),
	abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
	races: readJson("../../../data/races.json"),
	fighter: readJson("../../../data/class/class-fighter.json"),
	backgrounds: readJson("../../../data/backgrounds.json"),
	warlock: readJson("../../../data/class/class-warlock.json"),
	optionalFeatures: readJson("../../../data/optionalfeatures.json"),
	feats: readJson("../../../data/feats.json"),
	itemMasteries: readJson("../../../data/items-base.json"),
};
const catalog = createSpeciesCatalog({races: sources.races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const context = {rules: readJson("../../../js/character-builder/rules/character-sheet.json"), spells, sources};
const examples = createSheetExamples(catalog.dataset).flatMap(example => {
	const isGnome = example.document.build.species.name === "Gnome";
	return (isGnome ? ["forest", "rock"] : ["abyssal", "chthonic", "infernal"]).map(lineage => {
		const document = JSON.parse(JSON.stringify(example.document));
		const choice = document.build.choices.find(value => value.id.endsWith(isGnome ? ":lineage" : ":legacy"));
		choice.selected = [lineage];
		return {id: `${example.id}-${lineage}`, document};
	});
});

function* sourceStrings (value) {
	if (value == null) return;
	if (typeof value === "string" || typeof value === "number") { yield String(value); return; }
	if (Array.isArray(value)) {
		for (const item of value) yield * sourceStrings(item);
		return;
	}
	for (const key of ["name", "caption", "colLabels", "rows", "entries", "entry", "items", "footnotes"]) {
		if (value[key] != null) yield * sourceStrings(value[key]);
	}
}

function normalize (value) { return value.replace(/\s+/g, " ").trim(); }
function visibleText (html) {
	return normalize(html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'"));
}

function expectSourceWording (card, source) {
	const body = /<div class="cb-spell-body">([\s\S]*)<\/div>/.exec(card);
	expect(body).not.toBeNull();
	const actual = visibleText(body[1]);
	let offset = 0;
	for (const value of sourceStrings(source)) {
		const expected = normalize(Renderer.stripTags(value));
		if (!expected) continue;
		const found = actual.indexOf(expected, offset);
		expect(found).toBeGreaterThanOrEqual(offset);
		offset = found + expected.length;
	}
}

// Compare each original paragraph, heading, and table cell against the matching
// rendered card, using the site's own tag decoder as an independent oracle.
describe("Original character-sheet descriptions", () => {
	it.each(examples.map(example => [example.id, example.document]))("preserves the visible source text for %s", (_id, document) => {
		const model = createCharacterSheetModel(document, catalog, context);
		expect(model.status).toBe("complete");
		const html = renderCharacterSheet(model, catalog);
		const featureCards = [...html.matchAll(/<article class="cb-feature-reference">([\s\S]*?)<\/article>/g)].map(match => match[1]);
		expect(featureCards).toHaveLength(model.features.length);
		for (const [index, feature] of model.features.entries()) expectSourceWording(featureCards[index], feature.displayEntries);
		for (const spell of model.spells) {
			const escapedId = spell.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const card = new RegExp(`data-spell="${escapedId}">([\\s\\S]*?)<\\/article>`).exec(html);
			expect(card).not.toBeNull();
			expectSourceWording(card[1], [spell.metadata.entries, spell.metadata.entriesHigherLevel]);
		}
	});
});

describe("Supported spell source descriptions", () => {
	it("preserves all spell options, including those not selected in the example builds", () => {
		const rules = context.rules.classes["warlock|xphb"];
		const ids = new Set([
			...rules.cantripOptions,
			...rules.preparedOptions,
			...rules.subclassSpells.flatMap(grant => grant.spells),
			...catalog.spells.map(spell => spell.id),
			"spell:guidance|xphb", "spell:light|xphb", "spell:healing-word|xphb", "spell:mage-armor|xphb",
		]);
		const model = createCharacterSheetModel(examples.find(example => example.document.build.class.name === "Warlock").document, catalog, context);
		for (const id of ids) {
			const source = spells.spell.find(spell => `spell:${spell.name.toLowerCase().replaceAll(" ", "-")}|${spell.source.toLowerCase()}` === id);
			expect(source).toBeDefined();
			model.spells = [{id, ref: {name: source.name, source: source.source}, level: source.level, metadata: source, sources: [{kind: "class", label: "Class"}]}];
			const html = renderCharacterSheet(model, catalog);
			const card = /<article class="cb-spell [\s\S]*?<\/article>/.exec(html);
			expect(card).not.toBeNull();
			expectSourceWording(card[0], [source.entries, source.entriesHigherLevel]);
		}
	});
});
