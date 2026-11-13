import {ABILITY_IDS} from "../character-document.js";

/** Evaluate reviewed, declarative mechanics without inspecting rule descriptions. */
const EFFECT_TYPES = new Set([
	"resource", "savingThrowAdvantage", "skillAdvantage", "initiativeAdvantage",
	"armorBonus", "armorOverride", "criticalRange", "vision", "swimSpeed", "truesight", "spellGrant", "spellAttack", "spellDamageBonus", "resistance", "conditionImmunity", "telepathy", "temporaryHP", "damageRider",
]);
const CONDITION_KEYS = new Set(["classId", "backgroundId", "subclassId", "minimumLevel", "invocation", "knownSpell", "choice", "wearingArmor"]);

function resolve (value, refs) {
	if (Array.isArray(value)) return value.map(item => resolve(item, refs));
	if (!value || typeof value !== "object") return value;
	if (Object.hasOwn(value, "$ref")) {
		if (Object.keys(value).length !== 1 || typeof value["$ref"] !== "string") throw new TypeError("Invalid mechanics reference.");
		let result = refs;
		for (const part of value["$ref"].split(".")) {
			if (!Object.hasOwn(result || {}, part)) throw new TypeError(`Unknown mechanics reference: ${value["$ref"]}.`);
			result = result[part];
		}
		return result;
	}
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, refs)]));
}

const ABILITIES = new Set(ABILITY_IDS);
const SOURCE_TYPES = new Set(["classFeature", "subclassFeature", "optionalfeature", "feat", "spell", "race"]);
const EFFECT_FIELDS = {
	resource: ["type", "value"],
	savingThrowAdvantage: ["type", "ability", "condition", "feature", "concentration"],
	skillAdvantage: ["type", "skill"],
	initiativeAdvantage: ["type"],
	armorBonus: ["type", "amount"],
	armorOverride: ["type", "name", "base", "ability", "fallbackBase"],
	criticalRange: ["type", "min", "max"],
	vision: ["type", "value"],
	swimSpeed: ["type", "value"],
	truesight: ["type", "range"],
	spellGrant: ["type", "spellId", "casterId", "value"],
	spellAttack: ["type", "spellId", "casterId", "value"],
	spellDamageBonus: ["type", "spellId", "casterId", "amount"],
	resistance: ["type", "damageType", "condition"],
	conditionImmunity: ["type", "condition"],
	telepathy: ["type", "range"],
	temporaryHP: ["type", "value", "trigger", "note"],
	damageRider: ["type", "name", "amount", "damageTypes", "frequency", "appliesTo", "note"],
};
const DAMAGE_TYPES = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);
const nonempty = value => typeof value === "string" && !!value.trim();
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const plainObject = value => value && typeof value === "object" && !Array.isArray(value);

function keys (value, allowed, label) {
	if (!plainObject(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError(`Invalid ${label}.`);
}

function validateEffect (effect, {allowReferences = false, skillIds} = {}) {
	const isReference = value => allowReferences && plainObject(value) && Object.keys(value).length === 1 && typeof value["$ref"] === "string" && /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/.test(value["$ref"]);
	const validInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => isReference(value) || integer(value, min, max);
	const validText = value => isReference(value) || nonempty(value);
	const validAbility = value => isReference(value) || ABILITIES.has(value);
	keys(effect, EFFECT_FIELDS[effect.type], `mechanics effect ${effect.type}`);
	switch (effect.type) {
		case "resource": {
			const resource = effect.value;
			keys(resource, ["id", "name", "maxUses", "recovery", "activation", "healing", "spellId", "freeLevel", "spellcastingAbility", "slotLevel", "note"], "resource mechanic");
			if (!nonempty(resource.id) || !nonempty(resource.name) || !validInt(resource.maxUses, 1)) throw new TypeError("Invalid resource mechanic values.");
			if (resource.note !== undefined && !nonempty(resource.note)) throw new TypeError("Invalid resource note.");
			keys(resource.recovery, ["short", "long"], "resource recovery");
			if (!Object.keys(resource.recovery).length || Object.values(resource.recovery).some(value => value !== "all" && !validInt(value, 1, integer(resource.maxUses, 1) ? resource.maxUses : Number.MAX_SAFE_INTEGER))) throw new TypeError("Invalid resource recovery values.");
			if (resource.activation !== undefined && !["action", "bonus", "reaction"].includes(resource.activation)) throw new TypeError("Invalid resource activation.");
			if (resource.healing !== undefined) {
				keys(resource.healing, ["dice", "modifier"], "resource healing");
				if (!/^\d+d\d+$/.test(resource.healing.dice) || !validInt(resource.healing.modifier, -100, 100)) throw new TypeError("Invalid resource healing values.");
			}
			if (resource.spellId !== undefined && !validText(resource.spellId)) throw new TypeError("Invalid resource spell ID.");
			if (resource.spellcastingAbility !== undefined && !validAbility(resource.spellcastingAbility)) throw new TypeError("Invalid resource spellcasting ability.");
			for (const field of ["freeLevel", "slotLevel"]) if (resource[field] !== undefined && !validInt(resource[field], 0, 9)) throw new TypeError(`Invalid resource ${field}.`);
			break;
		}
		case "savingThrowAdvantage":
			if (!ABILITIES.has(effect.ability) || !nonempty(effect.feature) || (effect.condition != null && !nonempty(effect.condition)) || (effect.concentration !== undefined && typeof effect.concentration !== "boolean")) throw new TypeError("Invalid saving throw advantage mechanic.");
			break;
		case "skillAdvantage": if (!(skillIds instanceof Set) || !skillIds.has(effect.skill)) throw new TypeError("Invalid skill advantage mechanic."); break;
		case "initiativeAdvantage": break;
		case "armorBonus": if (!validInt(effect.amount, 0, 100)) throw new TypeError("Invalid armor bonus mechanic."); break;
		case "armorOverride":
			if (!nonempty(effect.name) || !integer(effect.base, 0, 100) || !ABILITIES.has(effect.ability) || !integer(effect.fallbackBase, 0, 100)) throw new TypeError("Invalid armor override mechanic.");
			break;
		case "criticalRange": if (!integer(effect.min, 1, 20) || !integer(effect.max, effect.min, 20)) throw new TypeError("Invalid critical range mechanic."); break;
		case "vision": {
			const vision = effect.value;
			keys(vision, ["type", "name", "range", "lighting", "magical", "nonmagical"], "vision mechanic");
			if (vision.type !== "vision" || !nonempty(vision.name) || !integer(vision.range, 1) || !Array.isArray(vision.lighting) || !vision.lighting.length || vision.lighting.some(item => !nonempty(item)) || typeof vision.magical !== "boolean" || typeof vision.nonmagical !== "boolean") throw new TypeError("Invalid vision mechanic values.");
			break;
		}
		case "swimSpeed": {
			const swim = effect.value;
			keys(swim, ["type", "name", "breatheUnderwater"], "swim speed mechanic");
			if (swim.type !== "swimSpeed" || !nonempty(swim.name) || typeof swim.breatheUnderwater !== "boolean") throw new TypeError("Invalid swim speed mechanic values.");
			break;
		}
		case "truesight": if (!validInt(effect.range, 1)) throw new TypeError("Invalid truesight mechanic."); break;
		case "spellGrant":
			keys(effect.value, ["id", "kind", "label", "atWill", "freeLevel", "target", "componentsRequired", "resourceId", "alwaysPrepared", "canCastWithSlots", "slotLevel"], "spell grant mechanic");
			if (!validText(effect.spellId) || !validText(effect.casterId) || !nonempty(effect.value.id) || !nonempty(effect.value.kind) || !nonempty(effect.value.label) || (effect.value.atWill !== undefined && typeof effect.value.atWill !== "boolean") || (effect.value.freeLevel !== undefined && !integer(effect.value.freeLevel, 0, 9)) || (effect.value.target !== undefined && !nonempty(effect.value.target)) || (effect.value.componentsRequired !== undefined && typeof effect.value.componentsRequired !== "boolean") || (effect.value.resourceId !== undefined && !nonempty(effect.value.resourceId)) || (effect.value.alwaysPrepared !== undefined && typeof effect.value.alwaysPrepared !== "boolean") || (effect.value.canCastWithSlots !== undefined && typeof effect.value.canCastWithSlots !== "boolean") || (effect.value.slotLevel !== undefined && !integer(effect.value.slotLevel, 0, 9))) throw new TypeError("Invalid spell grant mechanic values.");
			break;
		case "spellAttack": {
			const attack = effect.value;
			keys(attack, ["name", "action", "range", "dice", "damageType", "unit", "counts"], "spell attack mechanic");
			if (!validText(effect.spellId) || !validText(effect.casterId) || !nonempty(attack.name) || !nonempty(attack.action) || !nonempty(attack.range) || !/^\d+d\d+$/.test(attack.dice) || !nonempty(attack.damageType) || !nonempty(attack.unit) || !Array.isArray(attack.counts) || !attack.counts.length) throw new TypeError("Invalid spell attack mechanic values.");
			const levels = new Set();
			for (const step of attack.counts) {
				keys(step, ["minimumLevel", "value"], "spell attack progression");
				if (!integer(step.minimumLevel, 1, 20) || !integer(step.value, 1, 100) || levels.has(step.minimumLevel)) throw new TypeError("Invalid spell attack progression values.");
				levels.add(step.minimumLevel);
			}
			break;
		}
		case "spellDamageBonus": if (!validText(effect.spellId) || !validText(effect.casterId) || !validInt(effect.amount, -100, 100)) throw new TypeError("Invalid spell damage bonus mechanic."); break;
		case "resistance": if (!nonempty(effect.damageType) || (effect.condition != null && !nonempty(effect.condition))) throw new TypeError("Invalid resistance mechanic."); break;
		case "conditionImmunity": if (!nonempty(effect.condition)) throw new TypeError("Invalid condition immunity mechanic."); break;
		case "telepathy": if (!integer(effect.range, 1)) throw new TypeError("Invalid telepathy mechanic."); break;
		case "damageRider": {
			const types = effect.damageTypes;
			if (!nonempty(effect.name) || !validInt(effect.amount, -100, 100) || !Array.isArray(types) || !types.length
				|| types.some(type => !DAMAGE_TYPES.has(type)) || new Set(types).size !== types.length
				|| !nonempty(effect.frequency) || !nonempty(effect.appliesTo) || (effect.note !== undefined && !nonempty(effect.note))) throw new TypeError("Invalid damage rider mechanic.");
			break;
		}
		case "temporaryHP":
			if (!validInt(effect.value, 1) || !validText(effect.trigger) || (effect.note !== undefined && !validText(effect.note))) throw new TypeError("Invalid temporary hit point mechanic.");
			break;
		default: throw new TypeError(`Unsupported mechanics effect: ${effect.type}.`);
	}
}

/** Resolve only selected and level-eligible effects; reject unsupported conditions and effects. */
export function resolveMechanicEffects (annotations, context) {
	if (!Array.isArray(annotations)) throw new TypeError("Mechanics annotations must be an array.");
	if (typeof context?.hasSource !== "function") throw new TypeError("Mechanics source resolver is required.");
	const ids = new Set();
	const result = [];
	for (const annotation of annotations) {
		keys(annotation, ["id", "source", "when", "effects"], "mechanics annotation");
		if (!nonempty(annotation.id) || ids.has(annotation.id)) throw new TypeError("Missing or duplicate mechanics annotation ID.");
		ids.add(annotation.id);
		keys(annotation.source, ["type", "name", "source", "page", "className", "classSource", "subclassShortName", "subclassSource", "level"], "mechanics source");
		if (!SOURCE_TYPES.has(annotation.source.type) || !nonempty(annotation.source.name) || !nonempty(annotation.source.source)) throw new TypeError(`Missing mechanics source: ${annotation.id}.`);
		if (!annotation.when || typeof annotation.when !== "object" || Array.isArray(annotation.when)) throw new TypeError(`Missing mechanics conditions: ${annotation.id}.`);
		for (const key of Object.keys(annotation.when)) if (!CONDITION_KEYS.has(key)) throw new TypeError(`Unsupported mechanics condition: ${key}.`);
		if (!Array.isArray(annotation.effects) || !annotation.effects.length) throw new TypeError(`Missing mechanics effects: ${annotation.id}.`);
		for (const effect of annotation.effects) {
			if (!effect || !EFFECT_TYPES.has(effect.type)) throw new TypeError(`Unsupported mechanics effect: ${effect?.type}.`);
			validateEffect(effect, {allowReferences: true, skillIds: context.skillIds});
		}
		const {when} = annotation;
		for (const key of ["classId", "backgroundId", "subclassId", "invocation", "knownSpell"]) if (when[key] !== undefined && !nonempty(when[key])) throw new TypeError(`Invalid mechanics condition: ${key}.`);
		if (when.minimumLevel !== undefined && !integer(when.minimumLevel, 1, 20)) throw new TypeError("Invalid mechanics condition: minimumLevel.");
		if (when.wearingArmor !== undefined && typeof when.wearingArmor !== "boolean") throw new TypeError(`Invalid armor condition: ${annotation.id}.`);
		if (when.choice !== undefined) {
			keys(when.choice, ["id", "value"], "mechanics choice");
			if (!nonempty(when.choice.id) || !nonempty(when.choice.value)) throw new TypeError(`Invalid mechanics choice: ${annotation.id}.`);
		}
		if (when.classId && when.classId !== context.classId) continue;
		if (when.backgroundId && when.backgroundId !== context.backgroundId) continue;
		if (when.subclassId && when.subclassId !== context.subclassId) continue;
		if (when.minimumLevel && context.level < when.minimumLevel) continue;
		if (when.invocation && !context.invocations.includes(when.invocation)) continue;
		if (when.knownSpell && !context.knownSpells.includes(when.knownSpell)) continue;
		if (when.wearingArmor !== undefined) {
			if (typeof context.wearingArmor !== "boolean") throw new TypeError(`Invalid armor condition: ${annotation.id}.`);
			if (when.wearingArmor !== context.wearingArmor) continue;
		}
		if (when.choice) {
			if (!(context.choices.get(when.choice.id) || []).includes(when.choice.value)) continue;
		}
		if (!context.hasSource(annotation.source)) throw new TypeError(`Missing or ambiguous mechanics source: ${annotation.id}.`);
		for (const effect of annotation.effects) {
			const resolved = resolve(effect, context.refs);
			validateEffect(resolved, {skillIds: context.skillIds});
			result.push({...resolved, source: {...annotation.source}, annotationId: annotation.id});
		}
	}
	return result;
}
