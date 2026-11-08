import {projectSpecies} from "./species-projection.js";

const ABILITIES = [
	["str", "Strength", ["Athletics"]],
	["dex", "Dexterity", ["Acrobatics", "Sleight of Hand", "Stealth"]],
	["con", "Constitution", []],
	["int", "Intelligence", ["Arcana", "History", "Investigation", "Nature", "Religion"]],
	["wis", "Wisdom", ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"]],
	["cha", "Charisma", ["Deception", "Intimidation", "Performance", "Persuasion"]],
];
const ABILITY_NAMES = Object.fromEntries(ABILITIES.map(([key, name]) => [key, name]));

function escape (value) {
	return String(value).replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[char]);
}

function title (value) { return value ? value[0].toUpperCase() + value.slice(1) : "Pending"; }

/** Convert source tags to display text before escaping; never interpret them as HTML. */
function sourceText (value) {
	const input = String(value);
	let result = "";
	let cursor = 0;
	while (cursor < input.length) {
		const start = input.indexOf("{@", cursor);
		if (start < 0) return result + input.slice(cursor);
		result += input.slice(cursor, start);
		let end = start + 2;
		let depth = 1;
		for (; end < input.length && depth; ++end) {
			if (input[end] === "{") depth++;
			if (input[end] === "}") depth--;
		}
		if (depth) return result + input.slice(start);
		const content = input.slice(start + 2, end - 1);
		const space = content.indexOf(" ");
		const tag = (space < 0 ? content : content.slice(0, space)).toLowerCase();
		const parts = sourceText(space < 0 ? "" : content.slice(space + 1)).split("|");
		if (tag === "dc") result += `DC ${parts[0]}`;
		else if (["dice", "damage"].includes(tag)) result += parts[0];
		else result += parts[2] || parts[0];
		cursor = end;
	}
	return result;
}

function text (value) { return escape(sourceText(value)); }

function entries (value) {
	if (value === undefined || value === null) return "";
	if (Array.isArray(value)) return value.map(entries).join("");
	if (typeof value === "string" || typeof value === "number") return `<p>${text(value)}</p>`;
	const heading = value.name ? `<h4>${text(value.name)}</h4>` : "";
	if (value.type === "list") return `${heading}<ul>${(value.items || []).map(item => `<li>${typeof item === "string" ? text(item) : entries(item)}</li>`).join("")}</ul>`;
	if (value.type === "table") return `${heading}<table><thead><tr>${(value.colLabels || []).map(label => `<th>${text(label)}</th>`).join("")}</tr></thead><tbody>${(value.rows || []).map(row => `<tr>${row.map(cell => `<td>${typeof cell === "object" ? entries(cell) : text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
	return heading + entries(value.entries ?? value.entry ?? value.items);
}

function castingTime (spell) {
	return spell.time.map(time => {
		const unit = title(time.unit);
		const amount = ["action", "bonus", "reaction"].includes(time.unit) && time.number === 1 ? "" : `${time.number} `;
		const label = time.unit === "bonus" ? "Bonus Action" : `${amount}${unit}${time.number > 1 ? "s" : ""}`;
		return label + (time.condition ? ` — ${sourceText(time.condition)}` : "");
	}).join(" or ");
}

function range (spell) {
	const {distance} = spell.range;
	if (!distance) return title(spell.range.type);
	if (distance.amount !== undefined) return `${distance.amount} ${distance.type === "feet" ? "ft" : distance.type}`;
	return title(distance.type);
}

function duration (spell) {
	return spell.duration.map(value => {
		let label = value.type === "instant" ? "Instantaneous" : title(value.type);
		if (value.duration) label = `${value.duration.amount} ${value.duration.type}${value.duration.amount === 1 ? "" : "s"}`;
		return value.concentration ? `Concentration, up to ${label}` : label;
	}).join(" or ");
}

function components (spell) {
	const result = [];
	if (spell.components.v) result.push("V");
	if (spell.components.s) result.push("S");
	if (spell.components.m) {
		const material = spell.components.m;
		const detail = typeof material === "string" ? material : material.text || "Material";
		const cost = typeof material === "object" && material.cost !== undefined ? `; ${material.cost / 100} gp` : "";
		const consumed = typeof material === "object" && material.consume ? `; ${material.consume === "optional" ? "may be consumed" : "consumed"}` : "";
		result.push(`M (${detail}${cost}${consumed})`);
	}
	return result.join(", ") || "None";
}

function block (heading, body, extraClass = "") {
	return `<section class="cb-block${extraClass ? ` ${extraClass}` : ""}"><h2 class="cb-section-title">${escape(heading)}</h2>${body}</section>`;
}

function footer (document, catalog) {
	const sources = catalog.sources.map(source => {
		const label = escape(source.title);
		return /^https?:\/\//i.test(source.url) ? `<a href="${escape(source.url)}">${label}</a>` : label;
	}).join(" · ");
	return `<footer class="cb-page-footer"><span>${escape(document.name)} · Level ${document.build.level}</span><span>Draft · ${sources}<br>SRD 5.2.1 by Wizards of the Coast LLC · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>`;
}

function header (document, subtitle) {
	return `<header class="cb-page-head"><div><p class="cb-eyebrow">D&amp;D 2024 · Draft preview</p><h1>${escape(document.name)}</h1><p class="cb-subtitle">${escape(subtitle)}</p></div></header>`;
}

function abilityTable (document, projection) {
	const rows = ABILITIES.map(([key, name, skills]) => {
		const advantage = projection.savingThrowAdvantages.find(note => note.ability === key);
		const note = advantage ? `<span class="cb-tag cb-save-advantage">Advantage${advantage.condition ? `: ${escape(advantage.condition)}` : ""}</span>` : "";
		return `<tr data-ability="${key}"><th scope="row">${name}</th><td>${document.build.abilities.scores?.[key] ?? "—"}</td><td class="cb-pending">—</td><td class="cb-save"><span class="cb-pending">—</span> ${note}</td><td>${skills.map(skill => `<span class="cb-skill">${skill} <span class="cb-pending">—</span></span>`).join(" · ")}</td></tr>`;
	}).join("");
	return `<table class="cb-abilities"><caption>Ability scores, saving throws, and skills</caption><thead><tr><th scope="col">Ability</th><th scope="col">Base</th><th scope="col">Final</th><th scope="col">Save</th><th scope="col">Skills</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resources (projection, spellIndex) {
	if (!projection.resources.length) return "<p>No free-use spell resources granted at this level.</p>";
	return `<p class="cb-resource-detail">Blank marks for pencil · mark each spent use.</p>${projection.resources.map(resource => {
		const spell = spellIndex.get(resource.spellId);
		const reaction = spell.time.some(time => time.unit === "reaction") ? " <span class=\"cb-tag\">Reaction</span>" : "";
		const boxes = Array.from({length: resource.maxUses}, () => "<span class=\"cb-check\" aria-hidden=\"true\"></span>").join("");
		return `<div class="cb-resource"><div><strong>${escape(spell.ref.name)}</strong>${reaction}<p class="cb-resource-detail">${resource.maxUses} free ${resource.maxUses === 1 ? "use" : "uses"} · Long Rest · spell level ${spell.level}</p></div><span class="cb-resource-checks" aria-label="${resource.maxUses} blank spent-use boxes"><span>Spent</span>${boxes}</span></div>`;
	}).join("")}`;
}

function unresolved (projection) {
	if (!projection.unresolvedChoices.length) return "";
	const labels = {lineage: "Gnomish lineage", legacy: "Fiendish legacy", "spellcasting-ability": "Species spellcasting ability", size: "Size"};
	return block("Complete these choices", `<ul>${projection.unresolvedChoices.map(choice => {
		const label = labels[choice.id.split(":").at(-1)] || "Species choice";
		return `<li>${label}: ${choice.options.map(option => escape(ABILITY_NAMES[option] || title(option))).join(" / ")}</li>`;
	}).join("")}</ul>`, "cb-unresolved");
}

function spellCard (grant, spell, projection) {
	const resource = projection.resources.find(candidate => candidate.id === grant.resourceId);
	const casting = resource ? `${resource.maxUses} free ${resource.maxUses === 1 ? "use" : "uses"} / Long Rest at spell level ${spell.level}` : "At will";
	const permission = grant.canCastWithSlots ? ` · Suitable spell slots may also be used (level ${spell.level} or higher)` : "";
	const prepared = grant.alwaysPrepared ? " · Always prepared" : "";
	const ability = ABILITY_NAMES[grant.ability] || "Pending selection";
	return `<article class="cb-spell" data-spell="${escape(grant.id)}"><header class="cb-spell-head"><h3>${escape(spell.ref.name)}</h3><span class="cb-tag">Species</span></header><p class="cb-spell-meta">${spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} · ${escape(castingTime(spell))} · ${escape(range(spell))}<br>${escape(duration(spell))} · ${escape(components(spell))}${grant.ritual ? " · Ritual" : ""}<br>Spellcasting ability: ${ability}${prepared}</p><p class="cb-spell-permission">${escape(casting + permission)}</p><div class="cb-spell-body">${entries(spell.entries)}${entries(spell.entriesHigherLevel)}</div></article>`;
}

/** Render a read-only species contribution and a printable spell reference. */
export function renderSpeciesSheet (document, catalog) {
	const projection = projectSpecies(document, catalog);
	const spellIndex = new Map(catalog.spells.map(spell => [spell.id, spell]));
	const subtitle = `${document.build.class.name} · Level ${document.build.level} · ${document.build.species.name}`;
	const notice = "<p class=\"cb-draft-notice\">Species rules are shown. Final ability scores, class features, and class statistics are pending.</p>";
	const constants = `<div class="cb-constants"><span>Size <strong>${escape(title(projection.size))}</strong></span><span>Darkvision <strong>${projection.darkvision} ft</strong></span><span>Proficiency bonus <strong>+${projection.proficiencyBonus}</strong></span><span>Species magic <strong>${ABILITY_NAMES[projection.spellcastingAbility] || "Pending"}</strong></span></div>`;
	const metrics = `<div class="cb-combat-strip">${[["Armor Class", "—"], ["Initiative", "—"], ["Speed", `${projection.speed} ft`], ["Spell attack", "—"], ["Spell DC", "—"]].map(([label, value]) => `<div class="cb-metric"><span>${label}</span><strong class="${value === "—" ? "cb-pending" : "cb-value"}">${value}</strong></div>`).join("")}</div>`;
	const defenses = projection.resistances.length ? `Resistance: ${projection.resistances.map(title).map(escape).join(", ")}.` : "No damage resistance granted by the selected species options.";
	const reminders = projection.notes.map(note => `<p>${escape(note)}</p>`).join("");
	const currentHp = document.session.hp.current;
	const vitals = `<div class="cb-vitals"><div>Current HP <strong class="${currentHp === null ? "cb-pending" : "cb-value"}">${currentHp ?? "—"}</strong></div><div>Maximum HP <strong class="cb-pending">—</strong></div><div>Temporary HP <strong class="cb-value">${document.session.hp.temporary}</strong></div></div><p>Maximum HP, attacks, equipment, and class resources will appear after their choices and calculations are implemented.</p>`;
	const notes = document.session.notes ? block("Notes", `<div class="cb-notes">${escape(document.session.notes)}</div>`, "cb-notes-block") : "";
	const main = `<section class="cb-page cb-character-sheet">${header(document, subtitle)}${notice}${abilityTable(document, projection)}${constants}${metrics}<div class="cb-columns"><div class="cb-column">${block("Species resources", resources(projection, spellIndex))}${block("Defenses and features", `<div class="cb-features"><p>${defenses}</p>${reminders}</div>`)}</div><div class="cb-column">${block("Hit points and class details", vitals)}${unresolved(projection)}</div></div>${notes}${footer(document, catalog)}</section>`;
	if (!projection.spells.length) return main;
	const cards = [...projection.spells].sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name)).map(grant => spellCard(grant, spellIndex.get(grant.id), projection)).join("");
	return `${main}<section class="cb-page cb-spell-reference">${header(document, "Species spell reference")}<p class="cb-draft-notice">Only granted species spells are listed. Class spells and final spell attack/DC values are pending.</p><div class="cb-spell-grid">${cards}</div>${footer(document, catalog)}</section>`;
}
