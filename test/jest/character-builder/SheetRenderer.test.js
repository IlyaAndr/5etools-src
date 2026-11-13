import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {renderCharacterSheet, renderSpeciesSheet} from "../../../js/character-builder/sheet-renderer.js";
import {addArcanumChoices, addFeatChoices} from "./test-documents.js";

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rawSpells = readJson("../../../data/spells/spells-xphb.json");
const catalog = createSpeciesCatalog({
	races: readJson("../../../data/races.json"),
	spells: rawSpells,
	rules: readJson("../../../js/character-builder/rules/species.json"),
});
const context = {
	rules: readJson("../../../js/character-builder/rules/character-sheet.json"),
	spells: rawSpells,
	sources: {
		skills: readJson("../../../data/skills.json"),
		abilityNames: globalThis.Parser.ATB_ABV_TO_FULL,
		races: readJson("../../../data/races.json"),
		fighter: readJson("../../../data/class/class-fighter.json"),
		backgrounds: readJson("../../../data/backgrounds.json"),
		warlock: readJson("../../../data/class/class-warlock.json"),
		optionalFeatures: readJson("../../../data/optionalfeatures.json"),
		feats: readJson("../../../data/feats.json"),
		itemMasteries: readJson("../../../data/items-base.json"),
		spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
	},
};
const examples = createSheetExamples(catalog.dataset);
const character = (species = "gnome", level = 5) => JSON.parse(JSON.stringify(examples.find(example => example.id.includes(`-${species}-`) && example.document.build.level === level).document));
const project = document => createCharacterSheetModel(document, catalog, context);
const render = document => renderSpeciesSheet(document, catalog, context);
const card = (html, id) => new RegExp(`data-spell="spell:${id}\\|xphb">([\\s\\S]*?)<\\/article>`).exec(html)?.[1];
const abilityRow = (html, id) => new RegExp(`<tr data-ability="${id}">([\\s\\S]*?)<\\/tr>`).exec(html)[1];

describe("Calculated character sheet renderer", () => {
	it.each(examples.map(example => [example.id, example.document]))("fills every ability and all 18 skills for %s", (_id, document) => {
		const html = render(document);
		expect(html).toContain("data-sheet-status=\"complete\"");
		expect(html.match(/data-skill=/g)).toHaveLength(18);
		expect(html).toContain("scope=\"col\">Score</th>");
		expect(html).toContain("scope=\"col\">Mod</th>");
		expect(html).not.toContain("scope=\"col\">Base</th>");
		expect(html).not.toContain("scope=\"col\">Final</th>");
		expect(html).not.toContain("Class statistics are pending");
		expect(html).not.toContain("class=\"cb-draft-notice\"");
		expect(html).not.toContain("{@");
	});

	it("shows original feature descriptions with selected options and prerequisites", () => {
		const fighter = render(character());
		expect(fighter).toContain("Selected lineage: Forest Gnome.");
		expect(fighter).toContain("Prerequisite:</strong> Character level 4");
		expect(fighter).toContain("Prerequisite:</strong> Fighting Style");
		const warlock = render(character("tiefling"));
		expect(warlock).toContain("Selected legacy: Infernal.");
		expect(warlock).toContain("Prerequisite:</strong> Warlock level 2, a Warlock Cantrip That Deals Damage");
		expect(warlock).not.toContain("level undefined");
	});

	it("shows final scores, proficiency, Gnomish Cunning, and skill advantage beside the actual rolls", () => {
		const html = render(character());
		expect(abilityRow(html, "str")).toContain("class=\"cb-number\">18</td>");
		expect(abilityRow(html, "str")).toContain("<td class=\"cb-save\"><strong>+7</strong>");
		expect(abilityRow(html, "str")).toContain("cb-trained\" data-skill=\"athletics\">Athletics +7 <small>(advantage)</small>");
		expect(abilityRow(html, "dex")).toContain("Stealth +1 <small>(disadvantage)</small>");
		for (const id of ["int", "wis", "cha"]) {
			expect(abilityRow(html, id)).toContain("class=\"cb-save-advantage\" title=\"Gnomish Cunning\" aria-label=\"Advantage\">Adv.");
		}
		for (const id of ["str", "dex", "con"]) expect(abilityRow(html, id)).not.toContain("class=\"cb-save-advantage\"");
		expect(html).toContain("Passive Perception <strong>13</strong>");
		expect(html).toContain("class=\"cb-attack-panel\"><h2>Longsword</h2>");
		expect(html).toContain("2 attacks · +7");
		expect(html).toContain("1d8+4 slashing");
		expect(html).toContain("class=\"cb-other-attacks\"");
		expect(html).toContain("Javelin");
		expect(html).toContain("Handaxe");
		expect(html).toContain("Flail");
		expect(html).toContain("Conditions / duration");
		expect(html).not.toContain("Concentration: CON");
		expect(html).not.toContain("Chain Mail (75 GP)");
		expect(html).toContain("Unspent starting gold:");
	});

	it("shows the Pact Weapon attacks that Thirsting Blade and Devouring Blade grant", () => {
		const document = character("tiefling");
		document.build.choices.find(candidate => candidate.id.endsWith(":invocations")).selected = ["eldritch-mind|xphb", "agonizing-blast|xphb", "armor-of-shadows|xphb", "pact-of-the-blade|xphb", "thirsting-blade|xphb"];
		document.build.choices = document.build.choices.filter(saved => saved.id !== "class:warlock|xphb:repelling-blast-cantrip");
		document.build.choices.push({id: "class:warlock|xphb:pact-weapon", selected: ["longsword|xphb"]});
		const html = render(document);
		expect(html).toContain("class=\"cb-attack-panel\"><h2>Longsword</h2>");
		expect(html).toContain("2 attacks · +7");
		expect(html).toContain("<strong>Prerequisite:</strong> Warlock level 5, Pact of the Blade");
	});

	it("shows Eldritch Smite damage on the Pact Weapon attack", () => {
		const document = character("tiefling");
		document.build.choices.find(candidate => candidate.id.endsWith(":invocations")).selected = ["eldritch-mind|xphb", "agonizing-blast|xphb", "armor-of-shadows|xphb", "pact-of-the-blade|xphb", "eldritch-smite|xphb"];
		document.build.choices = document.build.choices.filter(saved => saved.id !== "class:warlock|xphb:repelling-blast-cantrip");
		document.build.choices.push({id: "class:warlock|xphb:pact-weapon", selected: ["longsword|xphb"]});
		const html = render(document);
		expect(html).toContain("class=\"cb-attack-rider\"><strong>Eldritch Smite:</strong> 4d8 Force · once per turn by expending a Pact Magic slot (level 3); the target can be Prone if it is Huge or smaller");
	});

	it("shows Lifedrinker's rider beside Eldritch Smite and the Hit Point Die recovery it offers", () => {
		const document = character("tiefling");
		document.build.level = 12;
		addFeatChoices(document, "class:warlock|xphb", 12);
		addArcanumChoices(document, "class:warlock|xphb", 12);
		document.build.choices.find(candidate => candidate.id.endsWith(":invocations")).selected = [
			"eldritch-mind|xphb", "agonizing-blast|xphb", "armor-of-shadows|xphb", "devils-sight|xphb", "repelling-blast|xphb",
			"pact-of-the-blade|xphb", "eldritch-smite|xphb", "lifedrinker|xphb",
		];
		document.build.choices.find(candidate => candidate.id.endsWith(":cantrips")).selected.push("spell:prestidigitation|xphb");
		document.build.choices.find(candidate => candidate.id.endsWith(":prepared-spells")).selected.push("spell:bane|xphb", "spell:charm-person|xphb", "spell:comprehend-languages|xphb", "spell:detect-magic|xphb", "spell:expeditious-retreat|xphb");
		document.build.choices.push({id: "class:warlock|xphb:pact-weapon", selected: ["longsword|xphb"]});
		const html = render(document);
		expect(html).toContain("<strong>Eldritch Smite:</strong> 6d8 Force · once per turn by expending a Pact Magic slot (level 5); the target can be Prone if it is Huge or smaller</p><p class=\"cb-attack-rider\"><strong>Lifedrinker:</strong> 1d6 Necrotic, Psychic, or Radiant · once per turn on a hit</p>");
		expect(html).toContain("Hit Dice 12d8</strong><p class=\"cb-resource-detail\">Recovery: Long Rest: all uses · Lifedrinker: expend one to regain 1d8 +2 HP (minimum 1)");
	});

	it("keeps partial Short Rest resources, separate species uses, and pencil trackers visible", () => {
		const fighter = render(character());
		expect(fighter).toContain("data-resource=\"class:fighter|xphb:second-wind\"");
		expect(fighter).toContain("Activation: Bonus Action · Healing: 1d10 +5 HP · Recovery: Short Rest: 1 use · Long Rest: all uses");
		expect(fighter).toContain("Second Wind");
		expect(fighter).toContain("Action Surge");
		expect(fighter).toContain("Hit Dice 5d10");
		expect(fighter).toContain("Death saves");
		expect(fighter).toContain("Heroic Inspiration");
		const warlock = render(character("tiefling"));
		expect(warlock).toContain("data-resource=\"class:warlock|xphb:pact-magic\"");
		expect(warlock).toContain("Hellish Rebuke</strong> <span class=\"cb-tag cb-reaction-tag\">Reaction</span>");
		expect(warlock).toContain("Free casting level: 1");
		expect(warlock).toContain("Free casting level: 2");
		expect(warlock).not.toContain("Ability: CHA");
		expect(warlock).not.toContain("Ability: INT");
		expect(warlock).not.toContain("checked");
		expect(warlock).not.toContain("<input");
	});

	it("shows the Celestial's once-per-turn damage rider with its computed amount", () => {
		const document = character("tiefling");
		document.build.level = 6;
		document.build.choices.find(choice => choice.id.endsWith(":subclass")).selected = ["celestial|xphb"];
		document.build.choices.find(choice => choice.id.endsWith(":prepared-spells")).selected.push("spell:charm-person|xphb");
		expect(project(document).issues).toEqual([]);
		const html = render(document);
		expect(html).toContain("data-rider=\"celestial-radiant-soul\"");
		expect(html).toContain("Radiant Soul:</strong> Once per turn · +4 to a spell&#39;s damage roll · Radiant or Fire");
	});

	it("shows the Fiend's triggered temporary hit points beside the trackers", () => {
		const html = render(character("tiefling"));
		expect(html).toContain("data-temporary-hp=\"fiend-dark-ones-blessing\"");
		expect(html).toContain("9 Temporary Hit Points · When you or someone else reduces an enemy within 10 feet of you to 0 Hit Points.");
	});

	it("shows known HP and conditional armor without guessing current HP", () => {
		const document = character("tiefling");
		let html = render(document);
		expect(html).toContain("aria-label=\"Current HP: blank\"");
		expect(html).toContain("class=\"cb-hp-max\">/ 38</strong>");
		expect(html).toContain("Mage Armor active; no armor worn");
		expect(html).toContain("Leather Armor 13 when worn instead.");
		expect(html).toContain("Without Mage Armor: AC 12.");
		document.session.hp = {current: 24, temporary: 5};
		html = render(document);
		expect(html).toContain("<strong class=\"cb-value\">24</strong><strong class=\"cb-hp-max\">/ 38</strong>");
		expect(html).toContain("<strong class=\"cb-value\">5</strong>");
		expect(html).toContain("Concentration save: CON +2 · advantage");
	});

	it("shows a granted swim speed, underwater breathing, and truesight as sheet senses", () => {
		const document = character("tiefling");
		document.build.choices = document.build.choices.filter(entry => !entry.id.endsWith("-cantrip"));
		document.build.choices.find(entry => entry.id === "class:warlock|xphb:invocations").selected = ["eldritch-mind|xphb", "armor-of-shadows|xphb", "devils-sight|xphb", "fiendish-vigor|xphb", "gift-of-the-depths|xphb"];
		const html = render(document);
		expect(html).toContain("Gift of the Depths: Swim 30 ft · breathe underwater");
		expect(html).toContain("data-resource=\"class:warlock|xphb:gift-of-the-depths-water-breathing\"");
		expect(card(html, "false-life")).toContain("<strong>Fiendish Vigor:</strong>");
		expect(card(html, "false-life")).toContain("At will · Target: self · Components: required");
		expect(card(html, "water-breathing")).toContain("<strong>Gift of the Depths:</strong>");
		expect(card(html, "water-breathing")).toContain("1 free use / Long Rest · spell level 3");
		const rules = JSON.parse(JSON.stringify(context.rules));
		rules.mechanics.push({
			id: "test:senses",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "warlock|xphb", minimumLevel: 1},
			effects: [{type: "truesight", range: 30}],
		});
		expect(renderCharacterSheet(createCharacterSheetModel(document, catalog, {...context, rules}), catalog)).toContain("Truesight: 30 ft");
	});

	it("renders condition immunities and telepathy senses", () => {
		const model = project(character("tiefling", 3));
		model.defenses.push({type: "conditionImmunity", condition: "charmed"}, {type: "telepathy", range: 30});
		const html = renderCharacterSheet(model, catalog);
		expect(html).toContain("Immunity: Charmed");
		expect(html).toContain("Telepathy: 30 ft");
	});

	it("shows a single shared spellcasting profile when all sources have the same values", () => {
		const html = render(character("tiefling"));
		expect(html).toContain("Spell DC</span><strong>15</strong>");
		expect(html).toContain("Spell attack</span><strong>+7</strong><small>CHA</small>");
		expect(html).not.toContain("aria-label=\"Spellcasting by source\"");
		expect(card(html, "eldritch-blast")).toContain("<strong>Warlock:</strong>");
		expect(card(html, "fire-bolt")).toContain("<strong>Species:</strong>");
		expect(card(html, "healing-word")).toContain("<strong>Magic Initiate:</strong>");
		expect(card(html, "fire-bolt")).not.toContain("CHA · attack");
		expect(html).toContain("One entry per spell · uses shown by source");
		expect(html).not.toContain("casting ability and uses shown by source");
	});

	it("keeps imported class Charisma and species Intelligence values separate", () => {
		const document = character("tiefling");
		document.build.choices.find(choice => choice.id === "species:tiefling|xphb:spellcasting-ability").selected = ["int"];
		const before = JSON.stringify(document);
		const html = render(document);
		expect(JSON.stringify(document)).toBe(before);
		expect(html).toContain("Warlock DC</span><strong>15</strong>");
		expect(html).toContain("Warlock attack</span><strong>+7</strong><small>CHA</small>");
		expect(html).toContain("aria-label=\"Spellcasting by source\"");
		expect(html).toContain("Species:</strong> INT · attack +4 · DC 12");
		expect(html).toContain("Ability: INT");
		expect(card(html, "eldritch-blast")).toContain("Warlock (CHA · attack +7 · DC 15)");
		expect(card(html, "fire-bolt")).toContain("Species (INT · attack +4 · DC 12)");
		expect(card(html, "hellish-rebuke")).toContain("1 free use / Long Rest · spell level 1 · Pact slot L3");
		expect(card(html, "healing-word")).toContain("Magic Initiate (CHA · attack +7 · DC 15)");
		expect(card(html, "fireball")).toContain("Fiend (CHA · attack +7 · DC 15)");
		expect(card(html, "fireball")).toContain("always prepared");
		expect(card(html, "fireball")).not.toContain("free use");
		expect(card(html, "hex")).toContain("Pact slot L3 · prepared");
		expect(card(html, "hex")).not.toContain("always prepared");
	});

	it("uses the active spell source rather than an unused class casting profile", () => {
		const model = project(character("tiefling"));
		model.spells = model.spells.filter(spell => spell.ref.name === "Fire Bolt");
		Object.assign(model.spells[0].sources[0], {ability: "int", attack: 4, dc: 12});
		const html = renderCharacterSheet(model, catalog);
		expect(html).toContain("Spell DC</span><strong>12</strong>");
		expect(html).toContain("Spell attack</span><strong>+4</strong><small>INT</small>");
		expect(html).not.toContain("aria-label=\"Spellcasting by source\"");
	});

	it("shows separate source values when the ability matches but a spell attack differs", () => {
		const model = project(character("tiefling"));
		model.spells.find(spell => spell.ref.name === "Fire Bolt").sources[0].attack++;
		const html = renderCharacterSheet(model, catalog);
		expect(html).toContain("aria-label=\"Spellcasting by source\"");
		expect(card(html, "fire-bolt")).toContain("Species (CHA · attack +8 · DC 15)");
		expect(card(html, "eldritch-blast")).toContain("Warlock (CHA · attack +7 · DC 15)");
	});

	it.each([[1, 9], [3, 17], [5, 23]])("unifies all spell sources into %s-level reference with %s unique cards", (level, count) => {
		const html = render(character("tiefling", level));
		const ids = [...html.matchAll(/data-spell="([^"]+)"/g)].map(match => match[1]);
		expect(ids).toHaveLength(count);
		expect(new Set(ids).size).toBe(count);
		expect(html).toContain("class=\"cb-page cb-spell-reference\"");
		for (const kind of ["class", "feat", "species"]) expect(html).toContain(`cb-source-${kind}`);
		if (level >= 3) expect(html).toContain("cb-source-subclass");
	});

	it("prints rituals, reaction triggers, components, and unlimited invocation casting correctly", () => {
		const forest = render(character());
		expect(card(forest, "speak-with-animals")).toContain("Ritual");
		expect(card(forest, "speak-with-animals")).toContain("3 free uses / Long Rest · spell level 1");
		expect(card(forest, "speak-with-animals")).not.toContain("Spell slot L1+");
		const html = render(character("tiefling"));
		expect(card(html, "hellish-rebuke")).toContain("Reaction — which you take in response to taking damage");
		expect(card(html, "darkness")).toContain("Concentration, up to 10 minutes");
		expect(card(html, "darkness")).toContain("M (bat fur and a piece of coal)");
		expect(card(html, "counterspell")).toContain("The creature makes a Constitution saving throw.");
		expect(card(html, "counterspell")).toContain("If that spell was cast with a spell slot, the slot isn&#39;t expended.");
		expect(card(html, "hellish-rebuke")).toContain("The damage increases by 1d10 for each spell slot level above 1.");
		expect(card(html, "mage-armor")).toContain("Abjuration · XPHB p. 293");
		expect(card(html, "mage-armor")).toContain("At will");
		expect(card(html, "mage-armor")).toContain("Target: self · Components: required");
		expect(card(html, "mage-armor")).not.toContain("free use / Long Rest");
	});

	it("suggests a shared spellcasting ability for unresolved source choices", () => {
		const document = character("tiefling");
		document.build.choices.find(choice => choice.id === "species:tiefling|xphb:spellcasting-ability").selected = [];
		document.build.choices.find(choice => choice.id === "feat:magic-initiate-cleric|xphb:ability").selected = [];
		const html = render(document);
		expect(html).toContain("data-sheet-status=\"incomplete\"");
		expect(html.match(/Suggested: CHA/g)).toHaveLength(2);
	});

	it("renders an incomplete import as a compact honest draft instead of a blank character sheet", () => {
		const document = readJson("../../fixtures/character-builder/tiefling-warlock-draft.json");
		document.build.choices = [];
		const html = render(document);
		expect(html).toContain("cb-character-sheet cb-draft-summary\" data-sheet-status=\"incomplete\"");
		expect(html).toContain("Complete these choices");
		expect(html).toContain("Fiendish legacy: Abyssal / Chthonic / Infernal");
		expect(html).not.toContain("class=\"cb-abilities\"");
		expect(html).not.toContain("class=\"cb-combat-strip\"");
		expect(html).not.toContain("Maximum HP");
		expect(html).not.toContain("class=\"cb-page cb-spell-reference\"");
		expect(html.match(/<section class="cb-page /g)).toHaveLength(1);
	});

	it("escapes player text, source descriptions, and unsafe source URLs", () => {
		const document = character();
		document.name = "<img src=x onerror=\"alert(1)\">";
		document.session.notes = "<script>alert(\"notes\")</script>\nKeep this line.";
		const model = project(document);
		const spell = model.spells.find(value => value.ref.name === "Minor Illusion");
		spell.ref.name = "Unknown reference";
		spell.metadata.entries = ["{@b <svg onload=alert(2)>} & text", {type: "entries", name: "Nested {@i title}", entries: ["{@dc 12}"]}];
		spell.sources[0].label = "<img src=x onerror=\"alert(4)\">";
		const changedCatalog = structuredClone(catalog);
		changedCatalog.sources[0].url = "javascript:alert(3)";
		const html = renderCharacterSheet(model, changedCatalog);
		expect(html).toContain("&lt;img");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("&lt;svg onload=alert(2)&gt; &amp; text");
		expect(html).toContain("Nested title");
		expect(html).toContain("DC 12");
		expect(html).not.toMatch(/<(?:script|img|svg)\b/);
		expect(html).not.toContain("javascript:");
		expect(html).toContain("\nKeep this line.");
	});

	it("retains costly and consumed material requirements", () => {
		const model = project(character());
		model.spells.find(spell => spell.ref.name === "Speak with Animals").metadata.components.m = {text: "a pearl", cost: 10000, consume: true};
		expect(renderCharacterSheet(model, catalog)).toContain("M (a pearl; 100 gp; consumed)");
	});

	it("shows the Pact Weapon as the primary attack using Charisma", () => {
		const document = character("tiefling", 5);
		document.build.choices.find(candidate => candidate.id === "class:warlock|xphb:invocations").selected = ["pact-of-the-blade|xphb", "agonizing-blast|xphb", "armor-of-shadows|xphb", "devils-sight|xphb", "repelling-blast|xphb"];
		document.build.choices.push({id: "class:warlock|xphb:pact-weapon", selected: ["longsword|xphb"]});
		const html = render(document);
		expect(html).toContain("data-sheet-status=\"complete\"");
		const panel = /<section class="cb-attack-panel">([\s\S]*?)<\/section>/.exec(html)[1];
		expect(panel).toContain("Longsword");
		expect(panel).toContain("+7");
		expect(panel).toContain("1d8+4 slashing");
	});

	it("preserves long names and notes without changing the document, model, or catalog", () => {
		const document = character();
		document.name = "A".repeat(200);
		document.session.notes = "Long note. ".repeat(909);
		const model = project(document);
		const before = JSON.stringify({document, model, catalog});
		const html = renderCharacterSheet(model, catalog);
		expect(html).toContain(document.name);
		expect(html).toContain(document.session.notes);
		expect(html).toContain("class=\"cb-block cb-notes-block\"");
		expect(html).toContain("class=\"cb-notes\"");
		expect(JSON.stringify({document, model, catalog})).toBe(before);
	});
});
