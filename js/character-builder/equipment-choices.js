import {validateCharacterDocument} from "./character-document.js";
import {describeChoices, option, refKey} from "./choice-common.js";
import {getBackgroundEquipment} from "./background-choices.js";

/** List the reviewed starting packages owned by one class. */
export function getClassEquipment (rules, classId) {
	return Object.entries(rules?.equipment || {}).filter(([, value]) => value.classId === classId);
}

/** Return the class starting-equipment choice independently of any background. */
export function getEquipmentChoiceDescriptors (document, {rules} = {}) {
	validateCharacterDocument(document);
	const classId = refKey(document.build.class);
	const packages = getClassEquipment(rules, classId);
	if (!packages.length) return [];
	const options = packages.map(([id, value]) => option(id, value.gear.join(", ")));
	const gold = rules?.classes?.[classId]?.gold;
	// The 2024 class also offers its starting gold instead of the package.
	if (Number.isFinite(gold) && gold > 0) options.push(option("gold", `Starting gold (${gold} GP)`));
	return [describeChoices(document)(`class:${classId}:equipment`, "Starting Equipment", 1, options)];
}

/**
 * Combine a reviewed class package with the selected background's fixed gear.
 * Armor and weapons come from the class package; background gear never changes
 * the class-owned combat values.
 */
export function resolveStartingEquipment (document, rules, equipmentId) {
	const classId = refKey(document.build.class);
	const background = getBackgroundEquipment(document.build.background, rules);
	if (!background || typeof background.cost !== "number" || background.cost < 0
		|| !Array.isArray(background.gear) || background.gear.some(item => typeof item !== "string")) throw new TypeError("Missing reviewed background equipment.");
	// Choosing the class's starting gold replaces the package: the full class
	// gold is kept, and the character buys equipment separately.
	if (equipmentId === "gold") {
		const classRule = rules?.classes?.[classId];
		if (typeof classRule?.gold !== "number" || classRule.gold < 0) throw new TypeError("Missing reviewed class starting gold.");
		return {id: "gold", cost: background.cost, classCost: 0, armor: null, weapons: [], gear: [...background.gear]};
	}
	const classPackage = rules?.equipment?.[equipmentId];
	if (!classPackage || classPackage.classId !== classId) throw new TypeError("Missing reviewed class starting equipment.");
	if (typeof classPackage.cost !== "number" || classPackage.cost < 0 || !classPackage.armor
		|| !Array.isArray(classPackage.weapons) || !Array.isArray(classPackage.gear)) throw new TypeError("Unsupported reviewed class starting equipment.");
	return {
		id: equipmentId,
		cost: classPackage.cost + background.cost,
		// Background gear is granted with the background, so it never draws on
		// the class starting-gold budget.
		classCost: classPackage.cost,
		armor: classPackage.armor,
		weapons: classPackage.weapons,
		gear: [...classPackage.gear, ...background.gear],
	};
}
