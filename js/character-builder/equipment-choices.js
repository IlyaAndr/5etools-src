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
	return [describeChoices(document)(`class:${classId}:equipment`, "Starting Equipment", 1, packages.map(([id, value]) => option(id, value.gear.join(", "))))];
}

/**
 * Combine a reviewed class package with the selected background's fixed gear.
 * Armor and weapons come from the class package; background gear never changes
 * the class-owned combat values.
 */
export function resolveStartingEquipment (document, rules, equipmentId) {
	const classId = refKey(document.build.class);
	const classPackage = rules?.equipment?.[equipmentId];
	if (!classPackage || classPackage.classId !== classId) throw new TypeError("Missing reviewed class starting equipment.");
	if (typeof classPackage.cost !== "number" || classPackage.cost < 0 || !classPackage.armor
		|| !Array.isArray(classPackage.weapons) || !Array.isArray(classPackage.gear)) throw new TypeError("Unsupported reviewed class starting equipment.");
	const background = getBackgroundEquipment(document.build.background, rules);
	if (!background || typeof background.cost !== "number" || background.cost < 0
		|| !Array.isArray(background.gear) || background.gear.some(item => typeof item !== "string")) throw new TypeError("Missing reviewed background equipment.");
	return {
		id: equipmentId,
		cost: classPackage.cost + background.cost,
		armor: classPackage.armor,
		weapons: classPackage.weapons,
		gear: [...classPackage.gear, ...background.gear],
	};
}
