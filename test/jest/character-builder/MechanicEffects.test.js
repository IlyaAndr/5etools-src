import {readFileSync} from "node:fs";
import "../../../js/parser.js";
import {resolveMechanicEffects} from "../../../js/character-builder/rules/effects.js";
import {createCharacterSheetModel} from "../../../js/character-builder/character-sheet-model.js";
import {createSheetExamples} from "../../../js/character-builder/sheet-examples.js";
import {createSpeciesCatalog} from "../../../js/character-builder/species-catalog.js";

const source = {type: "feat", name: "Sample Feature", source: "TEST", page: 42};
const annotation = () => ({
	id: "test:sample-feature",
	source: {...source},
	when: {classId: "example|test", minimumLevel: 3, wearingArmor: true, choice: {id: "example:selection", value: "selected"}},
	effects: [
		{type: "resource", value: {id: "test:sample-resource", name: "Sample Feature", maxUses: {$ref: "level.uses"}, recovery: {short: 1, long: "all"}, activation: "bonus", healing: {dice: "1d6", modifier: {$ref: "characterLevel"}}}},
		{type: "armorBonus", amount: 2},
	],
});
const context = () => ({
	skillIds: new Set(["athletics", "stealth"]),
	classId: "example|test",
	backgroundId: "background|test",
	subclassId: null,
	level: 3,
	invocations: [],
	knownSpells: [],
	wearingArmor: true,
	choices: new Map([["example:selection", ["selected"]]]),
	refs: {level: {uses: 2}, characterLevel: 3},
	hasSource: candidate => JSON.stringify(candidate) === JSON.stringify(source),
});
const clone = value => JSON.parse(JSON.stringify(value));

describe("Declarative character mechanics", () => {
	it("resolves a new source-qualified feature using generic effect types and preserves inputs", () => {
		const input = annotation();
		const state = context();
		const original = JSON.stringify({input, refs: state.refs, choices: [...state.choices]});
		const result = resolveMechanicEffects([input], state);
		expect(result).toEqual([
			{type: "resource", value: {id: "test:sample-resource", name: "Sample Feature", maxUses: 2, recovery: {short: 1, long: "all"}, activation: "bonus", healing: {dice: "1d6", modifier: 3}}, source, annotationId: "test:sample-feature"},
			{type: "armorBonus", amount: 2, source, annotationId: "test:sample-feature"},
		]);
		expect(JSON.stringify({input, refs: state.refs, choices: [...state.choices]})).toBe(original);
		result[0].value.healing.modifier = 99;
		expect(input.effects[0].value.healing.modifier).toEqual({$ref: "characterLevel"});
	});

	it("grants a subclass resistance only for the matching patron at its level", () => {
		const rule = {
			id: "test:patron-resistance",
			source: {...source},
			when: {subclassId: "fiend|xphb", minimumLevel: 6},
			effects: [{type: "resistance", damageType: "fire"}],
		};
		const state = {...context(), subclassId: "fiend|xphb", level: 6};
		expect(resolveMechanicEffects([rule], state)).toEqual([
			{type: "resistance", damageType: "fire", source, annotationId: "test:patron-resistance"},
		]);
		expect(resolveMechanicEffects([rule], {...state, subclassId: "celestial|xphb"})).toEqual([]);
		expect(resolveMechanicEffects([rule], {...state, level: 5})).toEqual([]);
	});

	it("keeps an optional resource note for variable effects", () => {
		const rule = annotation();
		rule.effects = [{type: "resource", value: {id: "test:dice-pool", name: "Dice Pool", maxUses: {$ref: "characterLevel"}, recovery: {long: "all"}, activation: "bonus", note: "Spend one or more dice; each restores 1d6 HP."}}];
		expect(resolveMechanicEffects([rule], context())).toEqual([{
			type: "resource",
			value: {id: "test:dice-pool", name: "Dice Pool", maxUses: 3, recovery: {long: "all"}, activation: "bonus", note: "Spend one or more dice; each restores 1d6 HP."},
			source,
			annotationId: "test:sample-feature",
		}]);
	});

	it("applies condition immunity and telepathy effects", () => {
		const rule = annotation();
		rule.effects = [{type: "conditionImmunity", condition: "charmed"}, {type: "telepathy", range: 30}];
		expect(resolveMechanicEffects([rule], context())).toEqual([
			{type: "conditionImmunity", condition: "charmed", source, annotationId: "test:sample-feature"},
			{type: "telepathy", range: 30, source, annotationId: "test:sample-feature"},
		]);
	});

	it.each([
		["level", state => { state.level = 2; }],
		["class", state => { state.classId = "other|test"; }],
		["choice", state => { state.choices.set("example:selection", ["different"]); }],
		["armor", state => { state.wearingArmor = false; }],
	])("does not grant the feature when the %s condition is unmet", (_label, change) => {
		const state = context();
		change(state);
		expect(resolveMechanicEffects([annotation()], state)).toEqual([]);
	});

	it.each([
		["unknown effect", rule => { rule.effects[0].type = "unrecognized"; }],
		["unknown condition", rule => { rule.when.unrecognized = true; }],
		["unknown reference", rule => { rule.effects[0].value.maxUses = {$ref: "level.missing"}; }],
		["invalid minimum level", rule => { rule.when.minimumLevel = "three"; }],
		["invalid armor condition", rule => { rule.when.wearingArmor = "yes"; }],
		["non-numeric armor bonus", rule => { rule.effects[1].amount = "2"; }],
		["missing armor bonus", rule => { delete rule.effects[1].amount; }],
		["non-numeric resource count", rule => { rule.effects[0].value.maxUses = "2"; }],
		["invalid recovery", rule => { rule.effects[0].value.recovery.short = 3; }],
		["invalid healing modifier", rule => { rule.effects[0].value.healing.modifier = "3"; }],
		["missing resistance damage type", rule => { rule.effects = [{type: "resistance"}]; }],
		["invalid resistance condition", rule => { rule.effects = [{type: "resistance", damageType: "fire", condition: 3}]; }],
		["invalid resource note", rule => { rule.effects[0].value.note = 3; }],
		["missing condition immunity", rule => { rule.effects = [{type: "conditionImmunity"}]; }],
		["non-numeric telepathy range", rule => { rule.effects = [{type: "telepathy", range: "30"}]; }],
		["missing source", rule => { delete rule.source; }],
	])("rejects %s explicitly", (_label, change) => {
		const input = annotation();
		change(input);
		expect(() => resolveMechanicEffects([input], context())).toThrow(TypeError);
	});

	it("rejects an unknown skill rather than silently ignoring its advantage", () => {
		const input = annotation();
		input.effects = [{type: "skillAdvantage", skill: "athletic"}];
		expect(() => resolveMechanicEffects([input], context())).toThrow(/skill/i);
	});

	it("validates skill advantages using the supplied catalog, even before a level gate", () => {
		const input = annotation();
		input.effects = [{type: "skillAdvantage", skill: "stealth"}];
		expect(resolveMechanicEffects([input], context())[0].skill).toBe("stealth");
		input.when.minimumLevel = 4;
		const state = context();
		state.skillIds.delete("stealth");
		expect(() => resolveMechanicEffects([input], state)).toThrow(/skill/i);
	});

	it("rejects an invalid literal effect even when its level gate is not met", () => {
		const input = annotation();
		input.when.minimumLevel = 4;
		input.effects[1].amount = "2";
		expect(() => resolveMechanicEffects([input], context())).toThrow(TypeError);
	});

	it.each(["species:gnome|xphb", "class:warlock|xphb", "feat:magic-initiate-cleric|xphb"])("keeps the explicit %s casting source on generic spell effects", casterId => {
		const input = annotation();
		input.effects = [
			{type: "spellGrant", casterId, spellId: "spell:mage-armor|xphb", value: {id: "test:spell-grant", kind: "feat", label: "Test Grant", atWill: true}},
			{type: "spellAttack", casterId, spellId: "spell:mage-armor|xphb", value: {name: "Test Attack", action: "Magic", range: "60 ft", dice: "1d6", damageType: "force", unit: "attacks", counts: [{minimumLevel: 1, value: 1}]}},
			{type: "spellDamageBonus", casterId, spellId: "spell:mage-armor|xphb", amount: 2},
		];
		const resolved = resolveMechanicEffects([input], context());
		expect(resolved.map(effect => effect.casterId)).toEqual([casterId, casterId, casterId]);
	});

	it.each(["spellGrant", "spellAttack", "spellDamageBonus"])("requires an explicit casting source for %s", type => {
		const input = annotation();
		const definitions = {
			spellGrant: {type, spellId: "spell:mage-armor|xphb", value: {id: "test:spell-grant", kind: "feat", label: "Test Grant"}},
			spellAttack: {type, spellId: "spell:mage-armor|xphb", value: {name: "Test Attack", action: "Magic", range: "60 ft", dice: "1d6", damageType: "force", unit: "attacks", counts: [{minimumLevel: 1, value: 1}]}},
			spellDamageBonus: {type, spellId: "spell:mage-armor|xphb", amount: 2},
		};
		input.effects = [definitions[type]];
		expect(() => resolveMechanicEffects([input], context())).toThrow(TypeError);
	});

	it("resolves swim speed and truesight as generic mechanics", () => {
		const input = annotation();
		input.effects = [
			{type: "swimSpeed", value: {type: "swimSpeed", name: "Gift of the Depths", breatheUnderwater: true}},
			{type: "truesight", range: 30},
		];
		const resolved = resolveMechanicEffects([input], context());
		expect(resolved.map(effect => effect.type)).toEqual(["swimSpeed", "truesight"]);
		expect(resolved[0].value).toEqual({type: "swimSpeed", name: "Gift of the Depths", breatheUnderwater: true});
		expect(resolved[1].range).toBe(30);
	});

	it.each([
		["an empty swim speed name", {type: "swimSpeed", value: {type: "swimSpeed", name: " ", breatheUnderwater: true}}],
		["a non-boolean underwater flag", {type: "swimSpeed", value: {type: "swimSpeed", name: "Test Swim", breatheUnderwater: "yes"}}],
		["an unsupported swim speed field", {type: "swimSpeed", value: {type: "swimSpeed", name: "Test Swim", breatheUnderwater: true, feet: 30}}],
		["a non-positive truesight range", {type: "truesight", range: 0}],
		["an unsupported truesight field", {type: "truesight", range: 30, name: "Witch Sight"}],
	])("rejects %s", (_label, effect) => {
		const input = annotation();
		input.effects = [effect];
		expect(() => resolveMechanicEffects([input], context())).toThrow(TypeError);
	});

	it("resolves temporary hit points from a reviewed value and keeps the trigger", () => {
		const rule = annotation();
		rule.effects = [{type: "temporaryHP", value: {$ref: "characterLevel"}, trigger: "When you reduce an enemy to 0 Hit Points."}];
		expect(resolveMechanicEffects([rule], context())).toEqual([{
			type: "temporaryHP",
			value: 3,
			trigger: "When you reduce an enemy to 0 Hit Points.",
			source,
			annotationId: "test:sample-feature",
		}]);
		rule.effects = [{type: "temporaryHP", value: 4, trigger: "When you finish a Short Rest.", note: "Allies gain half as much."}];
		expect(resolveMechanicEffects([rule], context())[0]).toMatchObject({value: 4, note: "Allies gain half as much."});
	});

	it("rejects a temporary hit point effect without a positive value, a trigger, or a usable note", () => {
		const rule = annotation();
		rule.effects = [{type: "temporaryHP", value: 0, trigger: "Always"}];
		expect(() => resolveMechanicEffects([rule], context())).toThrow(/temporary hit point/);
		rule.effects = [{type: "temporaryHP", value: 3, trigger: "  "}];
		expect(() => resolveMechanicEffects([rule], context())).toThrow(/temporary hit point/);
		rule.effects = [{type: "temporaryHP", value: 3, trigger: "Always", note: ""}];
		expect(() => resolveMechanicEffects([rule], context())).toThrow(/temporary hit point/);
		rule.effects = [{type: "temporaryHP", value: 3, trigger: "Always", value2: 1}];
		expect(() => resolveMechanicEffects([rule], context())).toThrow(TypeError);
	});

	it("keeps an always-prepared spell grant that can still use spell slots", () => {
		const input = annotation();
		input.effects = [{type: "spellGrant", spellId: "spell:contact-other-plane|xphb", casterId: "class:warlock|xphb", value: {id: "class:warlock|xphb", kind: "class", label: "Contact Patron", alwaysPrepared: true, canCastWithSlots: true, slotLevel: 5, freeLevel: 5, resourceId: "class:warlock|xphb:contact-patron"}}];
		expect(resolveMechanicEffects([input], context())[0].value).toMatchObject({alwaysPrepared: true, canCastWithSlots: true, slotLevel: 5});
		input.effects[0].value.alwaysPrepared = "yes";
		expect(() => resolveMechanicEffects([input], context())).toThrow(TypeError);
	});

	it("rejects a source reference that does not resolve to the checked source", () => {
		const input = annotation();
		input.source.name = "Different Feature";
		expect(() => resolveMechanicEffects([input], context())).toThrow(/source/i);
	});

	it("rejects duplicate annotations instead of applying a mechanic twice", () => {
		const input = annotation();
		expect(() => resolveMechanicEffects([input, clone(input)], context())).toThrow(/duplicate/i);
	});
});

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
	spellLookup: readJson("../../../data/generated/gendata-spell-source-lookup.json"),
};
const catalog = createSpeciesCatalog({races: sources.races, spells, rules: readJson("../../../js/character-builder/rules/species.json")});
const sheetRules = readJson("../../../js/character-builder/rules/character-sheet.json");
const examples = createSheetExamples(catalog.dataset);

describe("Declarative mechanics in a character sheet", () => {
	it("rejects a spell damage bonus without a matching caster and attack", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:unmatched-damage",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "fighter|xphb"},
			effects: [{type: "spellDamageBonus", casterId: "species:gnome|xphb", spellId: "spell:fire-bolt|xphb", amount: 1}],
		});
		const document = examples.find(example => example.document.build.class.name === "Fighter" && example.document.build.level === 5).document;
		expect(() => createCharacterSheetModel(document, catalog, {rules, spells, sources})).toThrow(/no matching attack/i);
	});

	it("uses a species casting source for a declarative spell grant without a casting class", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:species-spell",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "fighter|xphb", minimumLevel: 1},
			effects: [{type: "spellGrant", casterId: "species:gnome|xphb", spellId: "spell:mage-armor|xphb", value: {id: "test:species-spell", kind: "feat", label: "Test Grant", atWill: true}}],
		});
		const document = examples.find(example => example.document.build.class.name === "Fighter" && example.document.build.level === 5).document;
		const model = createCharacterSheetModel(document, catalog, {rules, spells, sources});
		expect(model.status).toBe("complete");
		const grant = model.spells.find(spell => spell.id === "spell:mage-armor|xphb");
		expect(grant.sources).toContainEqual(expect.objectContaining({kind: "feat", id: "test:species-spell", ability: "int", attack: 4, dc: 12, atWill: true}));
	});

	it("uses the selected species profile for a declarative spell attack and its matching damage bonus", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:species-attack",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "fighter|xphb", minimumLevel: 1},
			effects: [
				{type: "spellGrant", casterId: "species:gnome|xphb", spellId: "spell:fire-bolt|xphb", value: {id: "test:species-attack", kind: "feat", label: "Test Grant", atWill: true}},
				{type: "spellAttack", casterId: "species:gnome|xphb", spellId: "spell:fire-bolt|xphb", value: {name: "Test Attack", action: "Magic", range: "120 ft", dice: "1d10", damageType: "fire", unit: "attacks", counts: [{minimumLevel: 1, value: 1}]}},
				{type: "spellDamageBonus", casterId: "species:gnome|xphb", spellId: "spell:fire-bolt|xphb", amount: {$ref: "modifiers.int"}},
			],
		});
		const document = examples.find(example => example.document.build.class.name === "Fighter" && example.document.build.level === 5).document;
		const model = createCharacterSheetModel(document, catalog, {rules, spells, sources});
		expect(model.status).toBe("complete");
		expect(model.attacks[0]).toMatchObject({name: "Test Attack", toHit: 4, damage: "1d10+1 fire"});
	});

	it("does not mix spell attack bonuses between sources granting the same spell", () => {
		const rules = clone(sheetRules);
		const spellId = "spell:fire-bolt|xphb";
		const species = "species:tiefling|xphb";
		const warlock = "class:warlock|xphb";
		const attack = (name, casterId) => ({type: "spellAttack", casterId, spellId, value: {name, action: "Magic", range: "120 ft", dice: "1d10", damageType: "fire", unit: "attacks", counts: [{minimumLevel: 1, value: 1}]}});
		rules.mechanics.push({
			id: "test:distinct-spell-sources",
			source: {type: "feat", name: "Magic Initiate", source: "XPHB"},
			when: {classId: "warlock|xphb", minimumLevel: 1},
			effects: [
				attack("Species Attack", species),
				attack("Class Attack", warlock),
				{type: "spellDamageBonus", casterId: species, spellId, amount: {$ref: "modifiers.int"}},
				{type: "spellDamageBonus", casterId: warlock, spellId, amount: {$ref: "modifiers.cha"}},
			],
		});
		const original = examples.find(example => example.document.build.class.name === "Warlock" && example.document.build.level === 5).document;
		const document = clone(original);
		document.build.choices.find(choice => choice.id === "species:tiefling|xphb:spellcasting-ability").selected = ["int"];
		const model = createCharacterSheetModel(document, catalog, {rules, spells, sources});
		expect(model.status).toBe("complete");
		expect(model.attacks.find(value => value.name === "Species Attack")).toMatchObject({toHit: 4, damage: "1d10+1 fire"});
		expect(model.attacks.find(value => value.name === "Class Attack")).toMatchObject({toHit: 7, damage: "1d10+4 fire"});
	});

	it("rejects an effect whose casting source is unavailable to the character", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:unknown-caster",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "fighter|xphb", minimumLevel: 1},
			effects: [{type: "spellGrant", casterId: "class:wizard|xphb", spellId: "spell:mage-armor|xphb", value: {id: "test:unknown-caster", kind: "feat", label: "Test Grant"}}],
		});
		const document = examples.find(example => example.document.build.class.name === "Fighter" && example.document.build.level === 5).document;
		expect(() => createCharacterSheetModel(document, catalog, {rules, spells, sources})).toThrow(/cast/i);
	});

	it("results in a swim speed and truesight on the sheet defenses through annotations", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:senses",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "warlock|xphb", minimumLevel: 1},
			effects: [
				{type: "swimSpeed", value: {type: "swimSpeed", name: "Test Swim", breatheUnderwater: true}},
				{type: "truesight", range: 30},
			],
		});
		const document = examples.find(example => example.document.build.class.name === "Warlock" && example.document.build.level === 5).document;
		const model = createCharacterSheetModel(document, catalog, {rules, spells, sources});
		expect(model.status).toBe("complete");
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "swim", name: "Test Swim", feet: model.speed, breatheUnderwater: true}));
		expect(model.defenses).toContainEqual(expect.objectContaining({type: "truesight", range: 30}));
	});

	it.each([
		["fiendish-vigor|xphb", 2, "spellGrant"],
		["gift-of-the-depths|xphb", 5, "swimSpeed"],
		["witch-sight|xphb", 15, "truesight"],
	])("gates the reviewed %s annotation on its invocation and keeps its reviewed level", (invocation, minimumLevel, type) => {
		const annotation = sheetRules.mechanics.find(entry => entry.id === `invocation-${invocation.split("|")[0]}`);
		expect(annotation).toBeDefined();
		expect(annotation.effects[0].type).toBe(type);
		expect(sheetRules.invocations[invocation].minimumLevel).toBe(minimumLevel);
		const state = invocations => ({
			skillIds: new Set(),
			classId: "warlock|xphb",
			backgroundId: null,
			subclassId: null,
			level: minimumLevel,
			invocations,
			knownSpells: [],
			wearingArmor: false,
			choices: new Map(),
			refs: {},
			hasSource: candidate => JSON.stringify(candidate) === JSON.stringify(annotation.source),
		});
		expect(resolveMechanicEffects([annotation], state([invocation])).map(effect => effect.type)).toEqual([type, ...annotation.effects.slice(1).map(effect => effect.type)]);
		expect(resolveMechanicEffects([annotation], state([]))).toEqual([]);
	});

	it("rejects a spell-grant annotation that links to a missing resource", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:missing-resource",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "warlock|xphb", minimumLevel: 1},
			effects: [{type: "spellGrant", casterId: "class:warlock|xphb", spellId: "spell:water-breathing|xphb", value: {id: "test:missing-resource", kind: "invocation", label: "Test Grant", resourceId: "test:absent-resource"}}],
		});
		const document = examples.find(example => example.document.build.class.name === "Warlock" && example.document.build.level === 5).document;
		expect(() => createCharacterSheetModel(document, catalog, {rules, spells, sources})).toThrow(/resource/i);
	});

	it("adds a new gated feature resource through annotations without feature-specific evaluator code", () => {
		const rules = clone(sheetRules);
		rules.mechanics.push({
			id: "test:savage-resource",
			source: {type: "feat", name: "Savage Attacker", source: "XPHB"},
			when: {classId: "fighter|xphb", minimumLevel: 3, wearingArmor: true, choice: {id: "class:fighter|xphb:fighting-style", value: "defense|xphb"}},
			effects: [{type: "resource", value: {id: "test:savage-resource", name: "Test Resource", maxUses: {$ref: "level.secondWind"}, recovery: {long: "all"}}}],
		});
		const build = level => examples.find(example => example.document.build.class.name === "Fighter" && example.document.build.level === level).document;
		const make = level => createCharacterSheetModel(build(level), catalog, {rules, spells, sources});
		const firstLevel = make(1);
		const fifthLevel = make(5);
		expect(firstLevel.status).toBe("complete");
		expect(firstLevel.resources.find(resource => resource.id === "test:savage-resource")).toBeUndefined();
		expect(fifthLevel.status).toBe("complete");
		expect(fifthLevel.resources.find(resource => resource.id === "test:savage-resource")).toMatchObject({maxUses: 3, recovery: {long: "all"}});
		const original = sources.feats.feat.find(feat => feat.name === "Savage Attacker" && feat.source === "XPHB");
		expect(fifthLevel.features.find(feature => feature.name === "Savage Attacker").entries).toEqual(original.entries);
	});
});
