/** Shared helpers for independent choice providers. */

export const option = (id, label) => ({id, label});

/** Resolve a source-qualified reference to the lowercase key used by reviewed rules. */
export const refKey = ref => `${ref.name.toLowerCase().replaceAll(" ", "-")}|${ref.source.toLowerCase()}`;

/** Build a descriptor factory bound to one document's saved decisions. */
export function describeChoices (document) {
	const decisions = new Map(document.build.choices.map(choice => [choice.id, choice.selected]));
	return (id, label, count, options, minimumLevel = 1, available = true) => ({
		id,
		label,
		count,
		options,
		selected: [...(decisions.get(id) || [])],
		available: document.build.level >= minimumLevel && available,
		minimumLevel,
	});
}

/** Read the selected identifiers for one choice without inventing a value. */
export function selectedIds (document, id) {
	return [...(document.build.choices.find(choice => choice.id === id)?.selected || [])];
}

/**
 * Build ability-increase options from reviewed weighted alternatives, or from
 * the full ability list when a source allows any +2 / +1+1 combination.
 * Existing documents may use a different order for equivalent increases; keep
 * the saved identifier visible without rewriting the underlying choice.
 */
export function getIncreaseOptions (allowed, weights, abilityName, selected = []) {
	const result = [];
	if (weights) {
		const seen = new Set();
		for (const {from, weights: values} of weights) {
			const add = (chosen = []) => {
				if (chosen.length < values.length) {
					for (const id of from) if (!chosen.includes(id)) add([...chosen, id]);
					return;
				}
				const parts = chosen.map((id, index) => `${id}-${values[index]}`);
				const key = [...parts].sort().join(".");
				if (seen.has(key)) return;
				seen.add(key);
				result.push(option(parts.join("."), chosen.map((id, index) => `${abilityName(id)} +${values[index]}`).join(", ")));
			};
			add();
		}
	} else {
		for (const first of allowed) {
			result.push(option(`${first}-2`, `${abilityName(first)} +2`));
			for (const second of allowed.slice(allowed.indexOf(first) + 1)) result.push(option(`${first}-1.${second}-1`, `${abilityName(first)} +1, ${abilityName(second)} +1`));
		}
	}
	const normalized = value => value.split(".").sort().join(".");
	for (const value of selected) {
		if (result.some(entry => entry.id === value)) continue;
		const equivalent = result.find(entry => normalized(entry.id) === normalized(value));
		if (equivalent) result.push(option(value, equivalent.label));
	}
	return result;
}

const slug = value => value.toLowerCase().replaceAll(" ", "-");

/** Resolve a reviewed spell identifier to its original display name. */
export function createSpellOptionReader (rawSpells) {
	if (!Array.isArray(rawSpells)) throw new TypeError("Missing spell data.");
	return id => {
		const matches = rawSpells.filter(spell => `spell:${slug(spell.name)}|${spell.source.toLowerCase()}` === id);
		if (matches.length > 1) throw new TypeError(`Ambiguous spell ${id}.`);
		if (!matches.length) return {id, label: `Spell data unavailable: ${id}`, level: null};
		return {id, label: matches[0].name, level: matches[0].level};
	};
}

/** Map reviewed spell identifiers to selection options in their source order. */
export function getSpellOptions (rawSpells, ids) {
	const read = createSpellOptionReader(rawSpells);
	return ids.map(id => {
		const {label} = read(id);
		return option(id, label);
	});
}

/** Find one source-qualified class record without silently choosing among duplicates. */
export function findClassRecord (sources, sourceKey, ref) {
	const matches = (sources?.[sourceKey]?.class || []).filter(record => record.name === ref.name && record.source === ref.source);
	if (matches.length > 1) throw new TypeError(`Ambiguous ${ref.source} ${ref.name} class record.`);
	return matches[0] || null;
}
