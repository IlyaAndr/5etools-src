/**
 * Show the original 5etools text for the three selections that start a
 * character. The page already loads the site renderer and the source records,
 * so the same blocks the site displays are shown here: the race's creature
 * type, size, and speed before its traits, and the class's core traits,
 * multiclassing block, and source line before its features.
 */

const clone = value => JSON.parse(JSON.stringify(value));
const renderer = () => globalThis.Renderer?.get?.();
const styleHint = () => globalThis.VetoolsConfig?.get?.("styleSwitcher", "style") || "one";

/** Render the race summary the site prints above a race's traits. */
function renderSpecies (site, api, race) {
	const record = clone(race);
	const meta = site.race.getRaceRenderableEntriesMeta(record, {styleHint: styleHint()});
	return `${meta.entryAttributes ? api.render(meta.entryAttributes) : ""}${api.render(meta.entryMain)}`;
}

/** Render the class sidebar the site prints above a class's features. */
function renderClass (site, api, record) {
	const cls = clone(record);
	const options = {renderer: api, styleHint: styleHint()};
	const core = [
		site.class.getHtmlPtPrimaryAbility(cls, options),
		site.class.getHtmlPtHitPoints(cls, options),
		site.class.getHtmlPtSavingThrows(cls, options),
		site.class.getHtmlPtSkills(cls, options),
		site.class.getHtmlPtWeaponProficiencies(cls, options),
		site.class.getHtmlPtToolProficiencies(cls, options),
		site.class.getHtmlPtArmorProficiencies(cls, options),
		site.class.getHtmlPtStartingEquipment(cls, options),
	].filter(Boolean).join("");
	const sections = [`<h5>Core Traits</h5>${core}`];
	const mc = cls.multiclassing;
	if (mc) {
		const style = options.styleHint;
		const gained = mc.proficienciesGained;
		const parts = [];
		if (cls.primaryAbility) parts.push("<div>To qualify for a new class, you must have a score of at least 13 in the primary ability of the new class and your current classes.</div>");
		if (gained?.armor) parts.push(`<div><b>Armor Training:</b> ${site.class.getRenderedArmorProfs(gained.armor, {styleHint: style})}</div>`);
		if (gained?.weapons) parts.push(`<div><b>Weapon Proficiencies:</b> ${site.class.getRenderedWeaponProfs(gained.weapons, {styleHint: style})}</div>`);
		if (gained?.tools) parts.push(`<div><b>Tool Proficiencies:</b> ${site.class.getRenderedToolProfs(gained.tools, {styleHint: style})}</div>`);
		if (gained?.skills) parts.push(`<div><b>Skill Proficiencies:</b> ${site.class.getRenderedSkillProfs(gained.skills, {styleHint: style})}</div>`);
		if (mc.entries) parts.push(api.setFirstSection(true).render({type: "section", entries: clone(mc.entries)}));
		sections.push(`<h5>Multiclassing</h5>${parts.join("")}`);
	}
	const source = site.utils.getSourceAndPageTrHtml(cls);
	if (source) sections.push(`<p>${source}</p>`);
	return sections.join("");
}

/** Read the original class record and its features from the pinned class files. */
function readClass (sources, ref) {
	const files = [sources?.warlock, sources?.fighter];
	const record = files.flatMap(file => file?.class || []).find(candidate => candidate.name === ref.name && candidate.source === ref.source);
	if (!record) return null;
	const features = files
		.flatMap(file => file?.classFeature || [])
		.filter(feature => feature.className === record.name && feature.classSource === record.source && feature.source === record.source)
		.sort((left, right) => left.level - right.level);
	return {record, features};
}

/**
 * Render one spell's full text for the editor's spell pickers: the level and
 * school line the site prints above a spell, its casting time, range,
 * components, and duration, then the entries. The editor has the pinned spell
 * files at hand, so the description comes from the source record instead of a
 * summary.
 */
export function renderSpellInfo (spells, ref) {
	const site = globalThis.Renderer;
	const api = renderer();
	if (!site?.spell || !api || !ref?.name) return null;
	const list = Array.isArray(spells) ? spells : spells?.spell;
	if (!Array.isArray(list)) return null;
	const record = list.find(spell => spell.name === ref.name && spell.source === ref.source);
	if (!record?.entries) return null;
	const spell = clone(record);
	const style = styleHint();
	const isDisplaySelfArea = globalThis.SourceUtil?.isClassicSource?.(spell.source) ?? false;
	const meta = [
		site.spell.getHtmlPtLevelSchoolRitual(spell, {styleHint: style}),
		site.spell.getHtmlPtCastingTime(spell, {styleHint: style}),
		site.spell.getHtmlPtRange(spell, {styleHint: style, isDisplaySelfArea}),
		site.spell.getHtmlPtComponents(spell),
		site.spell.getHtmlPtDuration(spell, {styleHint: style}),
	].filter(Boolean).map(html => `<p class="cb-editor__spell-meta">${html}</p>`).join("");
	const entries = spell.entries;
	if (Array.isArray(spell.entriesHigherLevel)) entries.push(...spell.entriesHigherLevel);
	return `${meta}${api.render({type: "entries", entries})}`;
}

/**
 * Resolve one reviewed selection to its display name and rendered source text.
 * Return `null` when the data or the renderer is unavailable, so the panel can
 * stay hidden instead of showing an empty heading.
 */
export function renderSelectionInfo (sources, kind, ref) {
	const site = globalThis.Renderer;
	const api = renderer();
	if (!site || !api || !ref) return null;
	if (kind === "species") {
		const record = (sources?.races?.race || []).find(candidate => candidate.name === ref.name && candidate.source === ref.source);
		if (!record) return null;
		const html = renderSpecies(site, api, record);
		return html ? {name: record.name, html} : null;
	}
	if (kind === "background") {
		const record = (sources?.backgrounds?.background || []).find(candidate => candidate.name === ref.name && candidate.source === ref.source);
		if (!record?.entries) return null;
		const source = site.utils.getSourceAndPageTrHtml(clone(record));
		const html = `${api.render({type: "entries", entries: clone(record.entries)})}${source ? `<p>${source}</p>` : ""}`;
		return {name: record.name, html};
	}
	if (kind === "class") {
		const found = readClass(sources, ref);
		if (!found) return null;
		const features = found.features
			.map(feature => api.render({type: "entries", name: `${feature.name} (level ${feature.level})`, entries: clone(feature.entries)}))
			.join("");
		return {name: found.record.name, html: `${renderClass(site, api, found.record)}<h5>Class Features</h5>${features}`};
	}
	throw new TypeError(`Unsupported selection info: ${kind}`);
}
