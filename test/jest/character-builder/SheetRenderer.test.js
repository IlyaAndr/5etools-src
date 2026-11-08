import {readFileSync} from "node:fs";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {renderSpeciesSheet} from "../../../js/character-builder/sheet-renderer.js";

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

describe("Read-only species sheet renderer", () => {
	it("places Gnomish Cunning beside the relevant saving throw without inventing a bonus", () => {
		const html = renderSpeciesSheet(character("Gnome", "forest"), catalog);
		for (const ability of ["int", "wis", "cha"]) {
			const row = new RegExp(`<tr data-ability="${ability}">([\\s\\S]*?)<\\/tr>`).exec(html)[1];
			expect(row).toContain("class=\"cb-tag cb-save-advantage\"");
			expect(row).toContain("Advantage");
			expect(row).toContain("class=\"cb-save\"><span class=\"cb-pending\">—</span>");
		}
		for (const ability of ["str", "dex", "con"]) {
			const row = new RegExp(`<tr data-ability="${ability}">([\\s\\S]*?)<\\/tr>`).exec(html)[1];
			expect(row).not.toContain("Advantage");
		}
		expect(html.match(/class="cb-skill"/g)).toHaveLength(18);
	});

	it.each([[1, 0], [3, 1], [5, 2]])("prints separate blank Infernal resources at level %s", (level, expected) => {
		const html = renderSpeciesSheet(character("Tiefling", "infernal", level), catalog);
		expect(html.match(/class="cb-resource"/g) || []).toHaveLength(expected);
		expect(html.match(/class="cb-check"/g) || []).toHaveLength(expected);
		expect(html).not.toContain("checked");
		expect(html).not.toContain("<input");
		if (level >= 3) {
			expect(html).toContain("Hellish Rebuke</strong> <span class=\"cb-tag\">Reaction</span>");
			expect(html).toContain("Long Rest · spell level 1");
		}
	});

	it("renders base scores separately and keeps final values pending", () => {
		const document = character("Tiefling", "infernal");
		document.build.abilities.scores.int = 30;
		const html = renderSpeciesSheet(document, catalog);
		expect(html).toContain("scope=\"col\">Base</th>");
		expect(html).toContain("scope=\"col\">Final</th>");
		expect(html).toContain("<th scope=\"row\">Intelligence</th><td>30</td><td class=\"cb-pending\">—</td>");
		expect(html).toContain("Spell DC</span><strong class=\"cb-pending\">—</strong>");
		expect(html).toContain("Final ability scores, class features, and class statistics are pending");
		expect(html).not.toContain("DC 21");
	});

	it("renders a separate readable spell reference with rituals and reaction triggers", () => {
		const forest = renderSpeciesSheet(character("Gnome", "forest"), catalog);
		expect(forest.match(/<section class="cb-page /g)).toHaveLength(2);
		expect(forest).toContain("class=\"cb-page cb-spell-reference\"");
		expect(forest).toContain("Ritual");
		expect(forest).toContain("3 free uses / Long Rest at spell level 1");
		expect(forest).toContain("Suitable spell slots may also be used");
		const infernal = renderSpeciesSheet(character("Tiefling", "infernal"), catalog);
		expect(infernal).toContain("Reaction — which you take in response to taking damage");
		expect(infernal).toContain("Concentration, up to 10 minutes");
		expect(infernal).toContain("M (bat fur and a piece of coal)");
		expect(infernal).toContain("The damage increases by 1d10 for each spell slot level above 1.");
		expect(infernal).not.toContain("The damage increases by 2d10");
	});

	it("shows saved current and temporary HP while maximum HP remains pending", () => {
		const document = character("Tiefling", "infernal");
		document.session.hp = {current: 24, temporary: 5};
		const html = renderSpeciesSheet(document, catalog);
		expect(html).toContain("Current HP <strong class=\"cb-value\">24</strong>");
		expect(html).toContain("Temporary HP <strong class=\"cb-value\">5</strong>");
		expect(html).toContain("Maximum HP <strong class=\"cb-pending\">—</strong>");
		document.session.hp = {current: null, temporary: 0};
		const pending = renderSpeciesSheet(document, catalog);
		expect(pending).toContain("Current HP <strong class=\"cb-pending\">—</strong>");
		expect(pending).toContain("Temporary HP <strong class=\"cb-value\">0</strong>");
	});

	it.each([
		["Gnome", "forest"], ["Gnome", "rock"],
		["Tiefling", "abyssal"], ["Tiefling", "chthonic"], ["Tiefling", "infernal"],
	])("renders source entries for %s / %s without raw tags or duplicate spell cards", (species, lineage) => {
		const html = renderSpeciesSheet(character(species, lineage), catalog);
		expect(html).not.toContain("{@");
		const spellIds = [...html.matchAll(/data-spell="([^"]+)"/g)].map(match => match[1]);
		expect(new Set(spellIds).size).toBe(spellIds.length);
		if (lineage === "abyssal") expect(html).toContain("The damage increases by 1d8 for each spell slot level above 1.");
	});

	it("shows incomplete species choices without choosing a lineage or casting ability", () => {
		const document = character("Tiefling", "infernal");
		document.build.choices = [];
		const html = renderSpeciesSheet(document, catalog);
		expect(html).toContain("Complete these choices");
		expect(html).toContain("Fiendish legacy: Abyssal / Chthonic / Infernal");
		expect(html).toContain("Spellcasting ability: Pending selection");
		expect(html).toContain("Thaumaturgy");
		expect(html).not.toContain("Hellish Rebuke");
		expect(html).not.toContain("Resistance: Fire");
	});

	it("escapes character text, spell descriptions, and unsafe source URLs", () => {
		const document = character("Gnome", "forest");
		document.name = "<img src=x onerror=\"alert(1)\">";
		document.session.notes = "<script>alert(\"notes\")</script>\nKeep this line.";
		const changedCatalog = JSON.parse(JSON.stringify(catalog));
		changedCatalog.spells.find(spell => spell.ref.name === "Minor Illusion").entries = ["{@b <svg onload=alert(2)>} & text"];
		changedCatalog.sources[0].url = "javascript:alert(3)";
		const html = renderSpeciesSheet(document, changedCatalog);
		expect(html).toContain("&lt;img");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("&lt;svg onload=alert(2)&gt; &amp; text");
		expect(html).not.toMatch(/<(?:script|img|svg)\b/);
		expect(html).not.toContain("javascript:");
		expect(html).toContain("\nKeep this line.");
	});

	it("retains costly and consumed material requirements", () => {
		const changedCatalog = JSON.parse(JSON.stringify(catalog));
		changedCatalog.spells.find(spell => spell.ref.name === "Speak with Animals").components.m = {text: "a pearl", cost: 10000, consume: true};
		const html = renderSpeciesSheet(character("Gnome", "forest"), changedCatalog);
		expect(html).toContain("M (a pearl; 100 gp; consumed)");
	});

	it("preserves long names and notes as text and leaves all inputs unchanged", () => {
		const document = character("Gnome", "forest");
		document.name = "A".repeat(200);
		document.session.notes = "Long note. ".repeat(909);
		const before = JSON.stringify({document, catalog});
		const html = renderSpeciesSheet(document, catalog);
		expect(html).toContain(document.name);
		expect(html).toContain(document.session.notes);
		expect(html).toContain("class=\"cb-block cb-notes-block\"");
		expect(html).toContain("class=\"cb-notes\"");
		expect(JSON.stringify({document, catalog})).toBe(before);
	});
});
