const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const BIT_BY_ABILITY = Object.fromEntries(ABILITIES.map((ability, index) => [ability, 1 << index]));

/**
 * Suggest spellcasting abilities from already-resolved source options.
 *
 * Sources are `{id, allowed, selected?}`. `selected` is an authoritative saved
 * choice; a single allowed ability is fixed by that source. The result contains
 * each source's original `selected` value and a `suggested` value. Suggestions
 * are never applied to, or substituted for, an existing choice. `abilityScores`
 * is an optional map used to rank otherwise valid suggestions; the optional
 * `preferredAbility` takes precedence over scores when a choice is possible.
 *
 * `requiresDifferentAbilities` reports an empty intersection of the original
 * legal sets. `hasSavedDifferences` also identifies saved selections that block
 * an otherwise possible common ability. An empty source list represents a
 * character with no spellcasting sources.
 */
export function planSpellcastingChoices ({sources, preferredAbility = null, abilityScores = {}} = {}) {
	if (!Array.isArray(sources)) throw new TypeError("sources: expected an array");
	if (preferredAbility !== null && !ABILITIES.includes(preferredAbility)) throw new TypeError("preferredAbility: unsupported ability");
	if (!abilityScores || typeof abilityScores !== "object" || Array.isArray(abilityScores)) throw new TypeError("abilityScores: expected an object");
	for (const [ability, score] of Object.entries(abilityScores)) {
		if (!ABILITIES.includes(ability) || typeof score !== "number" || !Number.isFinite(score)) throw new TypeError(`abilityScores: invalid value for ${ability}`);
	}
	const ids = new Set();
	const normalized = Array.from(sources, source => {
		if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.id !== "string" || !source.id.trim() || ids.has(source.id)) throw new TypeError("source.id: expected a unique non-empty string");
		ids.add(source.id);
		if (!Array.isArray(source.allowed) || !source.allowed.length || source.allowed.some(ability => !ABILITIES.includes(ability)) || new Set(source.allowed).size !== source.allowed.length) throw new TypeError(`source.allowed: invalid ability options for ${source.id}`);
		const selected = source.selected ?? null;
		if (selected !== null && !source.allowed.includes(selected)) throw new TypeError(`source.selected: invalid choice for ${source.id}`);
		return {id: source.id, allowed: [...source.allowed], selected};
	});
	if (!normalized.length) return {commonAbilities: [], requiresDifferentAbilities: false, hasSavedDifferences: false, sources: []};
	const commonAbilities = ABILITIES.filter(ability => normalized.every(source => source.allowed.includes(ability)));
	const requiresDifferentAbilities = commonAbilities.length === 0;
	const explicit = normalized.map(source => source.selected).filter(Boolean);
	const hasSavedDifferences = new Set(explicit).size > 1 || (!requiresDifferentAbilities && explicit.some(ability => !commonAbilities.includes(ability)));
	const rank = ability => (abilityScores[ability] ?? 0);
	const compareAbility = (a, b) => Number(b === preferredAbility) - Number(a === preferredAbility) || rank(b) - rank(a) || ABILITIES.indexOf(a) - ABILITIES.indexOf(b);
	let best = null;
	for (let mask = 1; mask < (1 << ABILITIES.length); mask++) {
		if (normalized.some(source => source.selected ? !(mask & BIT_BY_ABILITY[source.selected]) : !source.allowed.some(ability => mask & BIT_BY_ABILITY[ability]))) continue;
		const chosen = normalized.map(source => source.selected || source.allowed.filter(ability => mask & BIT_BY_ABILITY[ability]).sort(compareAbility)[0]);
		const used = new Set(chosen);
		const preferred = preferredAbility && used.has(preferredAbility) ? 1 : 0;
		const score = chosen.reduce((total, ability) => total + rank(ability), 0);
		if (!best || used.size < best.count || (used.size === best.count && (preferred > best.preferred || (preferred === best.preferred && score > best.score)))) best = {count: used.size, preferred, score, chosen};
	}
	return {
		commonAbilities,
		requiresDifferentAbilities,
		hasSavedDifferences,
		sources: normalized.map((source, index) => ({...source, suggested: best.chosen[index]})),
	};
}
