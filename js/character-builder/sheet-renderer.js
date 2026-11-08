import {createCharacterSheetModel} from "./character-sheet-model.js";

const SOURCE_NAMES = {class: "Class", subclass: "Subclass", feat: "Feat", species: "Species", invocation: "Invocation"};

function escape (value) {
	return String(value).replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"})[char]);
}

function title (value) { return value ? value[0].toUpperCase() + value.slice(1) : "Unselected"; }
function signed (value) { return value >= 0 ? `+${value}` : String(value); }

/** Convert 5etools tags to their visible text while keeping the source wording. */
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
		if (depth) throw new Error("Unclosed source tag in character sheet description.");
		const content = input.slice(start + 2, end - 1);
		const space = content.indexOf(" ");
		const tag = (space < 0 ? content : content.slice(0, space)).toLowerCase();
		const raw = space < 0 ? "" : content.slice(space + 1);
		const parts = [];
		let partStart = 0;
		let nested = 0;
		for (let i = 0; i < raw.length; i++) {
			if (raw[i] === "{") nested++;
			else if (raw[i] === "}") nested--;
			else if (raw[i] === "|" && !nested) { parts.push(raw.slice(partStart, i)); partStart = i + 1; }
		}
		parts.push(raw.slice(partStart));
		let display;
		if (tag === "dc") display = `DC ${parts[1] || parts[0]}`;
		else if (["scaledice", "scaledamage"].includes(tag)) display = parts[4] || parts[2];
		else if (["dice", "damage", "autodice"].includes(tag)) display = parts[1] || parts[0];
		else if (["filter", "5etools", "link", "book", "adventure", "b", "bold", "i", "italic", "u", "s", "note"].includes(tag)) display = parts[0];
		else if (tag === "classfeature") display = parts[5] || parts[0];
		else if (tag === "subclassfeature") display = parts[7] || parts[0];
		else if (tag === "subclass") display = parts[4] || parts[0];
		else if (tag === "chance") display = parts[1] || `${parts[0]} percent`;
		else if (["hit", "d20", "initiative"].includes(tag)) display = parts[1] || `${Number(parts[0]) >= 0 ? "+" : ""}${parts[0]}`;
		else if (["spell", "item", "feat", "condition", "status", "sense", "skill", "action", "variantrule", "hazard", "creature", "optfeature", "background", "race", "class"].includes(tag)) display = parts[2] || parts[0];
		else throw new Error(`Unsupported source tag in character sheet description: ${tag}`);
		result += sourceText(display || "");
		cursor = end;
	}
	return result;
}

function text (value) { return escape(sourceText(value)); }

/** Render all source paragraphs and structural elements; unknown nodes must not disappear. */
function entries (value) {
	if (value === undefined || value === null) return "";
	if (Array.isArray(value)) return value.map(entries).join("");
	if (typeof value === "string" || typeof value === "number") return `<p>${text(value)}</p>`;
	const heading = value.name ? `<h4>${text(value.name)}</h4>` : "";
	if (value.type === "list") return `${heading}<ul>${(value.items || []).map(item => `<li>${typeof item === "string" ? text(item) : entries(item)}</li>`).join("")}</ul>`;
	if (value.type === "table") {
		const caption = value.caption ? `<caption>${text(value.caption)}</caption>` : "";
		const head = (value.colLabels || []).map(label => `<th>${text(label)}</th>`).join("");
		const rows = (value.rows || []).map(row => `<tr>${row.map(cell => `<td>${typeof cell === "object" ? entries(cell) : text(cell)}</td>`).join("")}</tr>`).join("");
		return `${heading}<table>${caption}${head ? `<thead><tr>${head}</tr></thead>` : ""}<tbody>${rows}</tbody></table>${entries(value.footnotes)}`;
	}
	if (!value.type || ["entries", "section", "item", "itemSub", "inset"].includes(value.type)) {
		if (value.entries === undefined && value.entry === undefined && value.items === undefined) throw new Error(`Empty source entry: ${value.type || "unknown"}`);
		return heading + entries(value.entries ?? value.entry ?? value.items);
	}
	throw new Error(`Unsupported source entry in character sheet description: ${value.type}`);
}

function castingTime (spell) {
	return spell.time.map(time => {
		const amount = ["action", "bonus", "reaction"].includes(time.unit) && time.number === 1 ? "" : `${time.number} `;
		const label = time.unit === "bonus" ? "Bonus Action" : `${amount}${title(time.unit)}${time.number > 1 ? "s" : ""}`;
		return label + (time.condition ? ` — ${sourceText(time.condition)}` : "");
	}).join(" or ");
}

function range (spell) {
	const {distance} = spell.range;
	if (!distance) return title(spell.range.type);
	if (distance.amount !== undefined) return `${distance.amount} ${distance.type === "feet" ? "ft" : distance.type}${spell.range.type === "point" ? "" : ` ${spell.range.type}`}`;
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
	return `<footer class="cb-page-footer"><span>${escape(document.name)} · Level ${document.build.level} · 2024</span><span>${sources}<br>SRD 5.2.1 by Wizards of the Coast LLC · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></span></footer>`;
}

function header (document, subtitle, eyebrow) {
	return `<header class="cb-page-head"><div><p class="cb-eyebrow">${escape(eyebrow)}</p><h1>${escape(document.name)}</h1><p class="cb-subtitle">${escape(subtitle)}</p></div></header>`;
}

function checks (count, label) {
	return `<span class="cb-resource-checks" aria-label="${escape(label)}">${Array.from({length: count}, () => "<span class=\"cb-check\" aria-hidden=\"true\"></span>").join("")}</span>`;
}

function abilityTable (model) {
	const rows = model.abilities.map(ability => {
		const advantage = ability.savingThrowAdvantages.map(note => `<span class="cb-save-advantage${note.condition ? " cb-save-conditional" : ""}" title="${escape(note.feature)}" aria-label="Advantage${note.condition ? `: ${escape(note.condition)}` : ""}">Adv.${note.condition ? `: ${escape(note.condition)}` : ""}</span>`).join("");
		const save = ability.saveProficient ? `<strong>${signed(ability.save)}</strong>` : signed(ability.save);
		const skills = ability.skills.map(skill => `<span class="cb-skill${skill.proficient ? " cb-trained" : ""}" data-skill="${escape(skill.id)}">${escape(skill.name)} ${signed(skill.modifier)}${skill.advantage ? " <small>(advantage)</small>" : ""}${skill.disadvantage ? " <small>(disadvantage)</small>" : ""}</span>`).join(" · ");
		return `<tr data-ability="${escape(ability.id)}"><th scope="row" title="${escape(ability.name)}">${escape(ability.id.toUpperCase())}</th><td class="cb-number">${ability.score}</td><td class="cb-number">${signed(ability.modifier)}</td><td class="cb-save">${save}${advantage}</td><td class="cb-skills">${skills}</td></tr>`;
	}).join("");
	return `<table class="cb-abilities"><caption class="cb-screen-reader">Ability scores, saving throws, and skills</caption><thead><tr><th scope="col">Ability</th><th scope="col">Score</th><th scope="col">Mod</th><th scope="col">Save</th><th scope="col">Skills / checks · bold = proficient</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function resourceRow (resource, model) {
	const spell = model.spells.find(candidate => candidate.id === resource.spellId);
	const reaction = spell?.metadata.time.some(time => time.unit === "reaction") ? " <span class=\"cb-tag cb-reaction-tag\">Reaction</span>" : "";
	const details = [resource.detail, resource.reset === "partial-short" ? resource.recovery : null].filter(Boolean).join(" · ");
	return `<div class="cb-resource" data-resource="${escape(resource.id)}"><div><strong>${text(resource.name)}</strong>${reaction}<p class="cb-resource-detail">${text(details)}</p></div>${checks(resource.maxUses, `${resource.maxUses} blank spent-use boxes`)}</div>`;
}

function resources (model) {
	const groups = [["short", "Short Rest / Long Rest"], ["long", "Long Rest"]];
	const content = groups.map(([reset, label]) => {
		const selected = model.resources.filter(resource => resource.reset === reset || (reset === "short" && resource.reset === "partial-short"));
		return selected.length ? `<p class="cb-rest-label">${label} · regain all unless noted · mark spent</p>${selected.map(resource => resourceRow(resource, model)).join("")}` : "";
	}).join("");
	const hitDice = `<div class="cb-resource"><div><strong>Hit Dice ${model.hitDice.count}d${escape(model.hitDice.die)}</strong><p class="cb-resource-detail">Mark spent · all recover on a Long Rest</p></div>${checks(model.hitDice.count, `${model.hitDice.count} blank Hit Die boxes`)}</div>`;
	const survival = `<div class="cb-survival-trackers"><div class="cb-death-saves"><span class="cb-field-label">Death saves</span><span>Success</span>${checks(3, "3 blank death-save success boxes")}<span>Failure</span>${checks(3, "3 blank death-save failure boxes")}</div><div class="cb-inspiration"><span class="cb-field-label">Heroic Inspiration</span>${checks(1, "Blank Heroic Inspiration box")}</div></div>`;
	return block("Resources & trackers", content + hitDice + survival, "cb-resource-block");
}

function vitals (model) {
	const current = model.hp.current === null ? "<span class=\"cb-write\" aria-label=\"Current HP: blank\"></span>" : `<strong class="cb-value">${model.hp.current}</strong>`;
	return `<div class="cb-vitals"><div><p class="cb-field-label">Current HP / maximum</p><div class="cb-hp-value">${current}<strong class="cb-hp-max">/ ${model.hp.maximum}</strong></div></div><div><p class="cb-field-label">Temporary HP</p><div class="cb-hp-value"><strong class="cb-value">${model.hp.temporary}</strong></div></div><p class="cb-hp-note cb-resource-detail">Fixed HP progression. Temporary HP do not stack.</p></div>`;
}

function attacks (model) {
	const [attack, ...others] = model.attacks;
	if (!attack) return "";
	const unit = attack.unit === "beams" ? "beam" : "attack";
	const label = attack.count ? `${attack.count} ${unit}${attack.count === 1 ? "" : "s"} · ` : "";
	const main = `<section class="cb-attack-panel"><h2>${text(attack.name)}</h2><div class="cb-attack-stats"><div><span>${text(attack.action)}</span><strong>${escape(label + signed(attack.toHit))}</strong></div><div><span>Each hit</span><strong>${text(attack.damage)}</strong></div></div>${attack.notes ? `<p>${text(Array.isArray(attack.notes) ? attack.notes.join(" ") : attack.notes)}</p>` : ""}<p class="cb-attack-meta">${text(attack.range)}</p></section>`;
	const secondary = others.length ? block("Other attacks", `<table class="cb-other-attacks"><thead><tr><th scope="col">Weapon / range</th><th scope="col">Attack</th><th scope="col">Damage</th></tr></thead><tbody>${others.map(other => `<tr><td>${text(other.name)} <small>${text(other.range)}</small></td><td>${signed(other.toHit)}</td><td>${text(other.damage)}</td></tr>`).join("")}</tbody></table>`) : "";
	return main + secondary;
}

function features (model) {
	return block("Features & choices", `<div class="cb-features">${model.features.map(feature => `<span>${text(feature.name)}</span>`).join(" · ")}</div>`);
}

function conditions (model) {
	const hasConcentration = model.spells.some(spell => spell.metadata.duration.some(value => value.concentration));
	if (!hasConcentration) return block("Conditions / duration", "<div class=\"cb-note-lines\" aria-label=\"Space for current effects and duration\"></div>", "cb-effects");
	const concentration = model.concentration || {modifier: model.abilities.find(ability => ability.id === "con").save, advantage: false};
	return block("Conditions / concentration / duration", `<p><strong>Concentration: CON ${signed(concentration.modifier)}${concentration.advantage ? ", advantage" : ""}.</strong> Damage save DC = max(10, half damage taken, rounded down), up to 30.</p><p>One concentration. Incapacitated ends it.</p><div class="cb-note-lines" aria-label="Space for current effects, concentration, and duration"></div>`, "cb-effects");
}

function gearLabel (value) {
	return value.replace(/\s*\(\d+(?:\.\d+)? (?:GP|SP)(?:; ([^)]+))?\)/g, (_match, detail) => detail ? ` (${detail})` : "");
}

function draftSummary (model, catalog) {
	const {document, species} = model;
	const labels = {lineage: "Gnomish lineage", legacy: "Fiendish legacy", "spellcasting-ability": "Species spellcasting ability", size: "Size"};
	const choices = model.issues.map(issue => {
		const selection = species?.unresolvedChoices.find(choice => choice.id === issue.id);
		const label = selection ? `${labels[selection.id.split(":").at(-1)] || "Species choice"}: ${selection.options.map(title).join(" / ")}` : issue.message;
		return `<li>${text(label)}</li>`;
	}).join("");
	const known = species ? `<p class="cb-draft-known">Species: <strong>${escape(document.build.species.name)}</strong> · Proficiency bonus <strong>${signed(species.proficiencyBonus)}</strong> · Speed <strong>${species.speed} ft</strong> · Darkvision <strong>${species.darkvision} ft</strong></p>` : "";
	const notes = document.session.notes ? block("Notes", `<div class="cb-notes">${escape(document.session.notes)}</div>`, "cb-notes-block") : "";
	return `<section class="cb-page cb-character-sheet cb-draft-summary" data-sheet-status="incomplete">${header(document, `${document.build.class.name} · Level ${document.build.level} · ${document.build.species.name}`, "Character draft · incomplete")}${known}${block("Complete these choices", `<ul class="cb-unresolved">${choices}</ul>`)}${notes}${footer(document, catalog)}</section>`;
}

function sourceKind (source) {
	return ["class", "subclass", "feat", "species", "invocation"].includes(source.kind) ? source.kind : "class";
}

function sourcePermission (source, spell, model) {
	const resource = model.resources.find(candidate => candidate.id === source.resourceId);
	const permission = [];
	if (source.atWill || spell.level === 0) permission.push("At will");
	if (source.resourceId && source.freeLevel !== undefined && source.freeLevel !== null) permission.push(`${resource?.maxUses || 1} free ${resource?.maxUses > 1 ? "uses" : "use"} / Long Rest at L${source.freeLevel}`);
	if (source.canCastWithSlots) permission.push(source.slotLevel ? `Pact slot L${source.slotLevel}` : `Spell slot L${spell.level}+`);
	if (source.alwaysPrepared && spell.level > 0) permission.push("always prepared");
	else if (source.prepared && spell.level > 0) permission.push("prepared");
	if (source.restriction) permission.push(source.restriction);
	const ability = source.ability ? `${source.ability.toUpperCase()} · attack ${signed(source.attack)} · DC ${source.dc}` : "";
	return `<p class="cb-spell-permission cb-source-${sourceKind(source)}"><strong>${text(source.label)}${ability ? ` (${escape(ability)})` : ""}:</strong> ${escape(permission.join(" · "))}</p>`;
}

function spellCard (spell, model) {
	const metadata = spell.metadata;
	const sources = spell.sources.map(source => `<span class="cb-tag cb-source-${sourceKind(source)}">${escape(SOURCE_NAMES[source.kind] || "Class")}</span>`).join("");
	return `<article class="cb-spell cb-source-${sourceKind(spell.sources[0])}" data-spell="${escape(spell.id)}"><header class="cb-spell-head"><h3>${escape(spell.ref.name)}</h3>${sources}</header><p class="cb-spell-meta">${spell.level === 0 ? "Cantrip" : `Level ${spell.level}`} · ${escape(castingTime(metadata))} · ${escape(range(metadata))}<br>${escape(duration(metadata))}${metadata.meta?.ritual ? " · Ritual (+10 min, no slot)" : ""}<br>${escape(components(metadata))}</p>${spell.sources.map(source => sourcePermission(source, spell, model)).join("")}<div class="cb-spell-body">${entries(spell.metadata.entries)}${entries(spell.metadata.entriesHigherLevel)}</div></article>`;
}

/** Render calculated values only; incomplete builds get a compact list of decisions. */
export function renderCharacterSheet (model, catalog) {
	if (model.status !== "complete") return draftSummary(model, catalog);
	const {document} = model;
	const className = model.className || document.build.class.name;
	const heading = `${className}${model.subclassName ? ` / ${model.subclassName}` : ""} · Level ${document.build.level}`;
	const subtitle = `${document.build.species.name} · ${title(model.size)}${document.build.background ? ` · ${document.build.background.name}` : ""} · D&D 2024`;
	const constants = `<div class="cb-constants"><span>PB <strong>${signed(model.proficiencyBonus)}</strong></span><span>Passive Perception <strong>${model.passives.perception}</strong></span><span>Insight <strong>${model.passives.insight}</strong></span><span>Investigation <strong>${model.passives.investigation}</strong></span><span>Darkvision <strong>${model.darkvision} ft</strong></span></div>`;
	const caster = model.spellcasting.find(candidate => candidate.id.startsWith("class:")) || model.spellcasting.find(candidate => candidate.kind === "class") || model.spellcasting[0];
	const metrics = [["AC", model.armorClass.value, ""], ["Initiative", signed(model.initiative.value), model.initiative.advantage ? "advantage" : ""], ["Speed", model.speed, "ft"], [model.attacks[0]?.name || "Attack", model.attacks.length ? signed(model.attacks[0].toHit) : "—", ""], [caster?.label ? `${caster.label} DC` : "Spell DC", caster?.dc ?? "—", ""], ["Spell attack", caster ? signed(caster.attack) : "—", caster?.ability?.toUpperCase() || ""]];
	const strip = `<div class="cb-combat-strip">${metrics.map(([label, value, detail]) => `<div class="cb-metric"><span>${escape(label)}</span><strong>${escape(value)}</strong>${detail ? `<small>${text(detail)}</small>` : ""}</div>`).join("")}</div>`;
	const equipment = block("Equipment & training", `<p>${model.gear.map(gearLabel).map(text).join(" · ")}</p><p><strong>Training:</strong> ${model.training.map(text).join(" · ")}</p><p><strong>Languages:</strong> ${model.languages.map(text).join(", ")}</p>`);
	const defenses = block("Defenses & senses", `<p><strong>AC ${model.armorClass.value}:</strong> ${text(model.armorClass.condition)}.</p>${model.defenses.length ? `<p>${model.defenses.map(text).join(" · ")}</p>` : ""}${model.armorClass.detail ? `<p>${text(model.armorClass.detail)}</p>` : ""}${model.armorClass.fallback !== undefined && model.armorClass.fallback !== null ? `<p>Without Mage Armor: AC ${model.armorClass.fallback}.</p>` : ""}`);
	const notes = document.session.notes ? block("Notes", `<div class="cb-notes">${escape(document.session.notes)}</div>`, "cb-notes-block") : "";
	const main = `<section class="cb-page cb-character-sheet" data-sheet-status="complete">${header(document, subtitle, heading)}${abilityTable(model)}${constants}${strip}<div class="cb-columns"><div class="cb-column">${resources(model)}${features(model)}</div><div class="cb-column">${vitals(model)}${attacks(model)}${defenses}${equipment}${conditions(model)}</div></div>${notes}${footer(document, catalog)}</section>`;
	const featureCards = model.features.map(feature => {
		const selection = feature.selection ? `<p class="cb-feature-selection"><strong>${text(feature.selection.label)}: ${text(feature.selection.value)}.</strong> The original description below may include other options.</p>` : "";
		const prerequisites = (feature.prerequisite || []).map(option => {
			const details = [];
			if (typeof option.level === "number") details.push(`Character level ${option.level}`);
			else if (option.level) details.push(`${option.level.class?.name || "Character"} level ${option.level.level}`);
			for (const item of option.feature || []) details.push(sourceText(item));
			for (const spell of option.spell || []) if (spell.entry) details.push(sourceText(spell.entry));
			return details.join(", ");
		}).filter(Boolean).join(" or ");
		const requirement = prerequisites ? `<p class="cb-feature-source"><strong>Prerequisite:</strong> ${escape(prerequisites)}</p>` : "";
		return `<article class="cb-feature-reference"><h3>${text(feature.name)}</h3><p class="cb-feature-source">${text(feature.source)} · ${text(feature.sourceRef.source)}${feature.sourceRef.page ? ` · p. ${feature.sourceRef.page}` : ""}</p>${selection}${requirement}<div class="cb-spell-body">${entries(feature.displayEntries ?? feature.entries)}</div></article>`;
	}).join("");
	const featureReference = featureCards ? `<section class="cb-page cb-feature-reference-page">${header(document, "Complete source descriptions", "Features reference · D&D 2024")}<div class="cb-reference-flow">${featureCards}</div>${footer(document, catalog)}</section>` : "";
	if (!model.spells.length) return main + featureReference;
	const cards = [...model.spells].sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name)).map(spell => spellCard(spell, model)).join("");
	const kinds = [...new Set(model.spells.flatMap(spell => spell.sources.map(sourceKind)))];
	const legend = `<div class="cb-source-legend">${kinds.map(kind => `<span class="cb-source-${kind}">${SOURCE_NAMES[kind]}</span>`).join("")}</div>`;
	return `${main}${featureReference}<section class="cb-page cb-spell-reference">${header(document, "One entry per spell · casting ability and uses shown by source", "Spell reference · D&D 2024")}${legend}<div class="cb-spell-grid">${cards}</div>${footer(document, catalog)}</section>`;
}

/** Compatibility entry point for callers holding a saved document and source context. */
export function renderSpeciesSheet (document, catalog, context = {}) {
	return renderCharacterSheet(createCharacterSheetModel(document, catalog, context), catalog);
}
