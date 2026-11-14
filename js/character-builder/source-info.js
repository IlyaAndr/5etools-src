/**
 * Show the original 5etools text for the three selections that start a
 * character. The page already loads the site renderer and the source records,
 * so the full text (with its own lists, tables, and links) is shown instead of
 * a hand-written summary.
 */

const clone = value => JSON.parse(JSON.stringify(value));

/** Render entries with the site's own renderer, keeping source markup faithful. */
function renderEntries (renderer, entries, name) {
	if (!Array.isArray(entries) || !entries.length) return "";
	return renderer.render({type: "entries", ...(name ? {name} : {}), entries: clone(entries)});
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
 * Resolve one reviewed selection to its display name and rendered source text.
 * Return `null` when the data or the renderer is unavailable, so the panel can
 * stay hidden instead of showing an empty heading.
 */
export function renderSelectionInfo (sources, kind, ref) {
	const renderer = globalThis.Renderer?.get?.();
	if (!renderer || !ref) return null;
	if (kind === "species") {
		const record = (sources?.races?.race || []).find(candidate => candidate.name === ref.name && candidate.source === ref.source);
		const html = record ? renderEntries(renderer, record.entries) : "";
		return html ? {name: record.name, html} : null;
	}
	if (kind === "background") {
		const record = (sources?.backgrounds?.background || []).find(candidate => candidate.name === ref.name && candidate.source === ref.source);
		const html = record ? renderEntries(renderer, record.entries) : "";
		return html ? {name: record.name, html} : null;
	}
	if (kind === "class") {
		const found = readClass(sources, ref);
		if (!found) return null;
		const html = found.features.map(feature => renderEntries(renderer, feature.entries, `${feature.name} (level ${feature.level})`)).join("");
		return html ? {name: found.record.name, html} : null;
	}
	throw new TypeError(`Unsupported selection info: ${kind}`);
}
