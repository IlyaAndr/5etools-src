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
