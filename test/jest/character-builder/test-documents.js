import {getWarlockChoiceDescriptors} from "../../../js/character-builder/warlock-choices.js";
import {setCharacterChoice} from "../../../js/character-builder/editor-common.js";

/**
 * Fill the reviewed feat/ability-score choices a high-level test document needs.
 * Uses increases on the lowest abilities so repeated levels never exceed 20.
 */
export function addFeatChoices (document, owner, level = document.build.level) {
	for (const featLevel of [4, 8, 12, 16]) {
		if (level < featLevel) continue;
		if (!document.build.choices.some(choice => choice.id === `${owner}:level-${featLevel}-feat`)) {
			document.build.choices.push({id: `${owner}:level-${featLevel}-feat`, selected: ["ability-score-improvement|xphb"]});
		}
		if (!document.build.choices.some(choice => choice.id === `${owner}:level-${featLevel}-ability-increases`)) {
			document.build.choices.push({id: `${owner}:level-${featLevel}-ability-increases`, selected: ["str-1.int-1"]});
		}
	}
	return document;
}

/**
 * Fill the Mystic Arcanum choices a Warlock gains at levels 11, 13, 15, and 17
 * so a high-level test document can be calculated.
 */
export function addArcanumChoices (document, owner, level = document.build.level) {
	for (const [minimumLevel, spellLevel, spellId] of [[11, 6, "spell:arcane-gate|xphb"], [13, 7, "spell:forcecage|xphb"], [15, 8, "spell:demiplane|xphb"], [17, 9, "spell:foresight|xphb"]]) {
		if (level < minimumLevel) continue;
		if (!document.build.choices.some(choice => choice.id === `${owner}:arcanum-${spellLevel}`)) document.build.choices.push({id: `${owner}:arcanum-${spellLevel}`, selected: [spellId]});
	}
	return document;
}

/**
 * Fill every available reviewed choice so a whole Warlock build can be
 * calculated. The editor's own descriptors decide what is available, and the
 * first legal option is taken for each group, so nothing is invented here.
 * Selections that stop being legal (a dependent group whose parent changed) are
 * pruned before the next fill pass.
 */
export function completeWarlock (document, catalog, context) {
	document.build.abilities.scores ||= {str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15};
	// Invocations that must affect a known cantrip are taken last, so the default
	// cantrip picks always leave this helper's build valid.
	const cantripInvocations = new Set(Object.entries(context.rules.invocations || {}).filter(([, value]) => value.cantripChoice).map(([id]) => id));
	let current = document;
	for (let pass = 0; pass < 20; pass += 1) {
		const available = getWarlockChoiceDescriptors(current, catalog, context).filter(entry => entry.available);
		let changed = false;
		for (const entry of available) {
			const allowed = new Set(entry.options.map(option => option.id));
			const kept = entry.selected.filter(id => allowed.has(id));
			if (kept.length !== entry.selected.length) {
				current = setCharacterChoice(current, entry.id, kept);
				changed = true;
				continue;
			}
			if (kept.length === entry.count) continue;
			let free = entry.options.map(option => option.id).filter(id => !kept.includes(id));
			if (entry.id.endsWith(":invocations")) free = [...free.filter(id => !cantripInvocations.has(id)), ...free.filter(id => cantripInvocations.has(id))];
			// The sheet requires Common, which is not always the first option.
			const required = entry.id.endsWith(":languages") && free.includes("common") ? ["common"] : [];
			current = setCharacterChoice(current, entry.id, [...kept, ...required, ...free.filter(id => !required.includes(id))].slice(0, entry.count));
			changed = true;
		}
		if (!changed) return current;
	}
	throw new TypeError("completeWarlock: the reviewed choices did not settle");
}
