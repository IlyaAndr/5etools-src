import {ABILITY_SCORE_METHODS, applySingleOptionSelections, getEditorAbilities, setCharacterChoice} from "./editor-common.js";
import {filterOptions, parseIncreaseOption} from "./choice-common.js";
import {getBackgroundEquipment} from "./background-choices.js";

/** Show a name filter once a checkbox group grows past a short, scannable list. */
const OPTION_FILTER_MINIMUM = 8;

/** Reviewed 2024 ability-score methods, mirrored by the sheet model checks. */
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY_COSTS = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9};
const POINT_BUY_BUDGET = 27;
const METHOD_SETTINGS = {
	standard: {min: 8, max: 15, help: "Standard array: enter 15, 14, 13, 12, 10, and 8 once each."},
	pointBuy: {min: 8, max: 15, help: "Point buy: 27 points, scores from 8 to 15. Scores 8–13 cost their value minus 8; 14 costs 7 and 15 costs 9."},
	manual: {min: 1, max: 20, help: "Manual entry: any score from 1 to 20. Background and feat increases cannot raise a score above 20."},
};

const isBackgroundIncrease = descriptor => descriptor.id.startsWith("background:") && descriptor.id.endsWith(":ability-increases");

/** A small editor for the subset currently supported by the sheet calculator. */
export function createCharacterEditor ({container, catalog, context, onChange, profiles}) {
	const abilities = getEditorAbilities(context.sources);
	const profileFor = document => document?.build?.level >= 1 && document.build.level <= 5
		? profiles.find(profile => profile.isSupportedDocument(document))
		: undefined;
	let character;
	let scoreInputs;
	const optionFilters = new Map();

	function element (tag, text, className) {
		const out = document.createElement(tag);
		if (text != null) out.textContent = text;
		if (className) out.className = className;
		return out;
	}

	function field (label, input) {
		const wrapper = element("label", null, "cb-editor__field");
		input.setAttribute("aria-label", label);
		wrapper.append(element("span", label), input);
		return wrapper;
	}

	function restoreFocus (...keys) {
		const controls = [...container.querySelectorAll("[data-cb-focus]")];
		for (const key of keys.filter(Boolean)) {
			const target = controls.find(input => input.dataset.cbFocus === key && !input.closest("[hidden]"));
			if (target) { target.focus(); return; }
		}
	}

	function autoSelectSingleOptions (document) {
		let current = document;
		for (let pass = 0; pass < 8; pass++) {
			const profile = profileFor(current);
			if (!profile) return current;
			const next = applySingleOptionSelections(current, profile.getChoiceDescriptors(current, catalog, context));
			if (next === current) return current;
			current = next;
		}
		return current;
	}

	function publish (next, redraw = true) {
		const active = container.contains(document.activeElement) ? document.activeElement : null;
		const focusKey = active?.dataset.cbFocus;
		const fallbackKey = active?.dataset.cbFocusFallback;
		if (!character || next.build !== character.build) next = autoSelectSingleOptions(next);
		if (!onChange(next)) {
			if (character) { render(); restoreFocus(focusKey, fallbackKey); }
			return false;
		}
		character = next;
		if (redraw) { render(); restoreFocus(focusKey, fallbackKey); }
		return true;
	}

	function updateBuild (changes, redraw = true) {
		return publish({...character, build: {...character.build, ...changes}}, redraw);
	}

	function select (options, selected, emptyLabel = "Choose…") {
		const input = document.createElement("select");
		input.append(new Option(emptyLabel, ""));
		for (const option of options) input.add(new Option(option.detail ? `${option.label} · ${option.detail}` : option.label, option.id));
		input.value = selected || "";
		return input;
	}

	/** Read the six score inputs, or null while any of them is not a number. */
	function readScoreInputs (inputs = null) {
		const values = {};
		for (const {id} of abilities) {
			const raw = `${(inputs ? inputs[id].value : scoreInputs[id]) ?? ""}`.trim();
			if (!/^\d+$/.test(raw)) return null;
			values[id] = Number(raw);
		}
		return values;
	}

	/** Explain what the selected ability-score method still allows. */
	function describeScores (method, values, filled) {
		const settings = METHOD_SETTINGS[method] || METHOD_SETTINGS.manual;
		if (!values) return {text: `${filled} of ${abilities.length} scores entered. ${settings.help}`, invalid: false};
		if (method === "standard") {
			const remaining = [...STANDARD_ARRAY];
			let invalid = false;
			for (const value of Object.values(values)) {
				const index = remaining.indexOf(value);
				if (index === -1) invalid = true;
				else remaining.splice(index, 1);
			}
			return {
				text: invalid
					? `Each standard-array value can be used only once. Values left: ${remaining.join(", ") || "none"}.`
					: `Standard-array values left: ${remaining.join(", ") || "none"}.`,
				invalid,
			};
		}
		if (method === "pointBuy") {
			let spent = 0;
			let invalid = false;
			for (const value of Object.values(values)) {
				if (POINT_BUY_COSTS[value] === undefined) invalid = true;
				else spent += POINT_BUY_COSTS[value];
			}
			const remaining = POINT_BUY_BUDGET - spent;
			const text = invalid
				? "Point buy uses scores from 8 to 15."
				: remaining < 0
					? `Over budget by ${-remaining} points (${spent} of ${POINT_BUY_BUDGET} spent).`
					: `${spent} of ${POINT_BUY_BUDGET} points spent; ${remaining} remaining.`;
			return {text, invalid: invalid || remaining < 0};
		}
		const invalid = Object.values(values).some(value => value < 1 || value > 20);
		return {text: invalid ? "Manual scores must be between 1 and 20." : "Manual scores are within the supported range.", invalid};
	}

	/** Show the combined result of the base scores and the reviewed increases. */
	function finalScoreNodes (descriptors, base = readScoreInputs()) {
		const amounts = Object.fromEntries(abilities.map(({id}) => [id, []]));
		for (const descriptor of descriptors.filter(entry => entry.available && entry.id.endsWith("ability-increases"))) {
			const [selected] = character.build.choices.find(choice => choice.id === descriptor.id)?.selected || [];
			for (const {ability, amount} of parseIncreaseOption(selected) || []) amounts[ability].push(amount);
		}
		const grid = element("div", null, "cb-editor__scores cb-editor__final-scores");
		for (const ability of abilities) {
			const parts = amounts[ability.id];
			const total = base ? base[ability.id] + parts.reduce((sum, value) => sum + value, 0) : null;
			const modifier = total == null ? "" : Math.floor((total - 10) / 2);
			const cell = element("div", null, "cb-editor__final-score");
			cell.append(element("span", ability.label, "cb-editor__final-label"));
			cell.append(element("strong", total == null ? "—" : `${total} (${modifier >= 0 ? "+" : ""}${modifier})`, "cb-editor__final-value"));
			if (parts.length && base) cell.append(element("small", `${base[ability.id]} + ${parts.join(" + ")}`, "cb-editor__final-detail"));
			grid.append(cell);
		}
		return [element("p", "Final scores after background and level increases", "cb-editor__help"), grid];
	}

	/** Render the base-score method, its live hints, and the combined totals. */
	function renderScores (descriptors) {
		const fieldset = element("fieldset", null, "cb-editor__group");
		fieldset.append(element("legend", "Base ability scores"));
		fieldset.append(element("p", "Assign all six scores before background and feat increases. Partial entries stay in this editor until all six are filled and are not included in a saved JSON file.", "cb-editor__help"));
		const method = character.build.abilities.method;
		const settings = METHOD_SETTINGS[method] || METHOD_SETTINGS.manual;
		const methodSelect = select(ABILITY_SCORE_METHODS, method);
		methodSelect.remove(0);
		methodSelect.dataset.cbFocus = "character:score-method";
		methodSelect.value = method;
		methodSelect.addEventListener("change", () => updateBuild({abilities: {...character.build.abilities, method: methodSelect.value}}));
		fieldset.append(field("Method", methodSelect), element("p", settings.help, "cb-editor__help"));
		const grid = element("div", null, "cb-editor__scores");
		const inputs = {};
		const status = element("p", null, "cb-editor__help cb-editor__score-status");
		status.setAttribute("aria-live", "polite");
		const final = element("div", null, "cb-editor__final");
		const updateStatus = () => {
			const values = readScoreInputs(inputs);
			const filled = abilities.filter(({id}) => /^\d+$/.test(`${inputs[id].value}`.trim())).length;
			const feedback = describeScores(method, values, filled);
			status.textContent = feedback.text;
			status.classList.toggle("cb-editor__score-status--invalid", feedback.invalid);
			for (const ability of abilities) {
				const value = values?.[ability.id];
				if (value != null && (value < settings.min || value > settings.max)) inputs[ability.id].setAttribute("aria-invalid", "true");
				else inputs[ability.id].removeAttribute("aria-invalid");
			}
			final.replaceChildren(...finalScoreNodes(descriptors, values));
		};
		for (const ability of abilities) {
			const input = element("input");
			input.type = "number";
			input.dataset.cbFocus = `character:score:${ability.id}`;
			input.min = `${settings.min}`;
			input.max = `${settings.max}`;
			input.step = "1";
			input.value = scoreInputs[ability.id] ?? "";
			input.addEventListener("input", updateStatus);
			input.addEventListener("change", () => {
				const previous = {...scoreInputs};
				scoreInputs[ability.id] = input.value;
				const allScores = abilities.map(({id}) => scoreInputs[id]);
				const complete = allScores.every(value => /^\d+$/.test(`${value}`) && Number(value) >= 1 && Number(value) <= 20);
				const values = complete ? Object.fromEntries(abilities.map(({id}) => [id, Number(scoreInputs[id])])) : null;
				if (!updateBuild({abilities: {...character.build.abilities, scores: values}})) {
					scoreInputs = previous;
					render();
					restoreFocus(`character:score:${ability.id}`);
				}
			});
			inputs[ability.id] = input;
			grid.append(field(ability.label, input));
		}
		fieldset.append(grid, status);
		const backgroundIncrease = descriptors.find(isBackgroundIncrease);
		if (backgroundIncrease) {
			const group = renderChoiceGroup(backgroundIncrease);
			if (group) fieldset.append(group);
		}
		fieldset.append(final);
		updateStatus();
		return fieldset;
	}

	/** Render one saved choice as a selector, a checkbox group, or a fixed value. */
	function renderChoiceGroup (descriptor) {
		const hasSavedChoice = character.build.choices.some(choice => choice.id === descriptor.id);
		if (!descriptor.available && !descriptor.selected.length && !hasSavedChoice) return null;
		const group = element("fieldset", null, "cb-editor__group");
		group.append(element("legend", descriptor.label));
		const required = descriptor.required || [];
		const displayedOptions = [...descriptor.options, ...descriptor.selected.filter(id => !descriptor.options.some(option => option.id === id)).map(id => ({id, label: `${id} (previous selection)`}))];
		const fixedOption = descriptor.available && descriptor.count === 1 && displayedOptions.length === 1 ? displayedOptions[0] : null;
		const requiredOptions = descriptor.options.filter(option => required.includes(option.id));
		const freeCount = Math.max(0, descriptor.count - requiredOptions.length);
		if (fixedOption) {
			group.append(element("p", "Only one option is legal for this build, so it is fixed and already selected.", "cb-editor__help"));
		} else if (descriptor.count > 1) {
			const selectedFree = descriptor.selected.filter(id => !required.includes(id)).length;
			group.append(element("p", requiredOptions.length
				? `${requiredOptions.map(option => option.label).join(", ")} ${requiredOptions.length === 1 ? "is" : "are"} required and included automatically. Choose ${freeCount} more (${selectedFree} of ${freeCount} chosen).`
				: `Choose ${descriptor.count} (${descriptor.selected.length} of ${descriptor.count} selected).`, "cb-editor__help"));
		} else if (descriptor.count === 1) group.append(element("p", "Choose 1.", "cb-editor__help"));
		if (descriptor.help) group.append(element("p", descriptor.help, "cb-editor__help"));
		if (!descriptor.available) group.append(element("p", "This saved choice is unavailable at the current level. Remove it or restore the previous level.", "cb-editor__help"));
		const options = element("div", null, "cb-editor__options");
		if (fixedOption) {
			group.append(element("p", fixedOption.detail ? `${fixedOption.label} · ${fixedOption.detail}` : fixedOption.label, "cb-editor__fixed"));
		} else if (descriptor.count === 1 && descriptor.selected.length <= 1) {
			const input = select(displayedOptions, descriptor.selected[0], "No selection");
			input.setAttribute("aria-label", descriptor.label);
			input.dataset.cbFocus = descriptor.id;
			for (const option of input.options) if (option.value && !descriptor.available && option.value !== descriptor.selected[0]) option.disabled = true;
			input.addEventListener("change", () => publish(setCharacterChoice(character, descriptor.id, input.value ? [input.value] : [])));
			options.append(input);
		} else {
			const atLimit = descriptor.selected.length >= descriptor.count;
			let filterInput = null;
			let filterStatus = null;
			if (displayedOptions.length >= OPTION_FILTER_MINIMUM) {
				filterInput = element("input");
				filterInput.type = "search";
				filterInput.value = optionFilters.get(descriptor.id) ?? "";
				filterInput.placeholder = "Type to narrow the list";
				filterInput.setAttribute("aria-label", `Filter ${descriptor.label}`);
				filterInput.dataset.cbFocus = `filter:${descriptor.id}`;
				filterStatus = element("p", null, "cb-editor__help cb-editor__filter-status");
				filterStatus.setAttribute("aria-live", "polite");
				filterStatus.hidden = true;
				const wrapper = element("label", null, "cb-editor__field cb-editor__filter");
				wrapper.append(element("span", "Filter options"), filterInput);
				group.append(wrapper, filterStatus);
			}
			const rows = [];
			for (const option of displayedOptions) {
				const label = element("label", null, "cb-editor__option");
				const input = element("input");
				input.type = "checkbox";
				input.setAttribute("aria-label", option.label);
				input.dataset.cbFocus = `${descriptor.id}|${option.id}`;
				if (filterInput) input.dataset.cbFocusFallback = filterInput.dataset.cbFocus;
				input.checked = descriptor.selected.includes(option.id);
				const isRequired = required.includes(option.id);
				input.disabled = isRequired ? input.checked : ((!descriptor.available && !input.checked) || (atLimit && !input.checked));
				input.addEventListener("change", () => {
					const selected = input.checked ? [...descriptor.selected, option.id] : descriptor.selected.filter(id => id !== option.id);
					publish(setCharacterChoice(character, descriptor.id, selected));
				});
				label.append(input, element("span", option.detail ? `${option.label} · ${option.detail}` : option.label));
				options.append(label);
				rows.push({option, label});
			}
			if (filterInput && filterStatus) {
				const applyFilter = () => {
					const query = filterInput.value;
					optionFilters.set(descriptor.id, query);
					const matches = new Set(filterOptions(displayedOptions, query).map(option => option.id));
					let shown = 0;
					for (const row of rows) {
						const keep = matches.has(row.option.id) || descriptor.selected.includes(row.option.id);
						row.label.hidden = !keep;
						if (keep) shown++;
					}
					filterStatus.hidden = !query.trim() || shown === rows.length;
					filterStatus.textContent = matches.size ? `Showing ${shown} of ${rows.length} options.` : "No options match this filter.";
				};
				filterInput.addEventListener("input", applyFilter);
				applyFilter();
			}
		}
		if (options.childElementCount) group.append(options);
		for (const option of descriptor.options) {
			if (context.rules.equipment[option.id]?.gear) group.append(element("p", option.label, "cb-editor__package"));
		}
		const backgroundEquipment = getBackgroundEquipment(character.build.background, context.rules);
		if (descriptor.id.endsWith(":equipment") && backgroundEquipment?.gear?.length) group.append(element("p", `Background equipment: ${backgroundEquipment.gear.join(", ")}`, "cb-editor__package"));
		if (!descriptor.available && hasSavedChoice) {
			const remove = element("button", "Remove saved choice", "cb-button");
			remove.type = "button";
			remove.setAttribute("aria-label", `Remove saved choice ${descriptor.label}`);
			remove.dataset.cbFocus = `remove:${descriptor.id}`;
			remove.dataset.cbFocusFallback = descriptor.id;
			remove.addEventListener("click", () => publish(setCharacterChoice(character, descriptor.id, [])));
			group.append(remove);
		}
		return group;
	}

	function render () {
		const profile = profileFor(character);
		if (!profile) throw new TypeError("Character is outside the supported editor profiles.");
		const heading = element("div", null, "cb-editor__heading");
		const title = element("div");
		title.append(element("h2", profile.title), element("p", profile.scope));
		const close = element("button", "Close editor", "cb-button");
		close.type = "button";
		close.addEventListener("click", () => { container.hidden = true; });
		heading.append(title, close);
		const intro = element("p", profile.intro, "cb-editor__intro");
		const basic = element("div", null, "cb-editor__grid");
		const name = element("input");
		name.type = "text";
		name.dataset.cbFocus = "character:name";
		name.maxLength = 200;
		name.value = character.name;
		name.addEventListener("change", () => {
			if (!name.value.trim()) {
				name.setCustomValidity("Enter a character name.");
				name.reportValidity();
				return;
			}
			name.setCustomValidity("");
			publish({...character, name: name.value}, false);
		});
		const level = select([1, 2, 3, 4, 5].map(value => ({id: `${value}`, label: `Level ${value}`})), `${character.build.level}`);
		level.remove(0);
		level.dataset.cbFocus = "character:level";
		level.value = `${character.build.level}`;
		level.addEventListener("change", () => updateBuild({level: Number(level.value)}));
		basic.append(field("Character name", name), field("Level", level));
		const descriptors = profile.getChoiceDescriptors(character, catalog, context);
		const scores = renderScores(descriptors);
		const choices = element("div", null, "cb-editor__choices");
		for (const descriptor of descriptors) {
			if (isBackgroundIncrease(descriptor)) continue;
			const group = renderChoiceGroup(descriptor);
			if (group) choices.append(group);
		}
		const unknown = character.build.choices.filter(choice => !descriptors.some(descriptor => descriptor.id === choice.id));
		if (unknown.length) {
			const group = element("fieldset", null, "cb-editor__group");
			group.append(element("legend", "Other saved choices"), element("p", "These saved choices are not editable in this editor. You can keep them or remove them individually.", "cb-editor__help"));
			for (const choice of unknown) {
				const row = element("div", null, "cb-editor__unknown");
				const remove = element("button", "Remove choice", "cb-button");
				remove.type = "button";
				remove.setAttribute("aria-label", `Remove choice ${choice.id}`);
				remove.dataset.cbFocus = `remove:${choice.id}`;
				remove.dataset.cbFocusFallback = "character:level";
				remove.addEventListener("click", () => publish(setCharacterChoice(character, choice.id, [])));
				row.append(element("span", `${choice.id}: ${choice.selected.join(", ") || "(empty)"}`), remove);
				group.append(row);
			}
			choices.append(group);
		}
		container.replaceChildren(heading, intro, basic, scores, choices);
		container.hidden = false;
	}

	return {
		canEdit: document => !!profileFor(document),
		create (profileId, selection) {
			const profile = profiles.find(candidate => candidate.id === profileId);
			if (!profile) throw new TypeError(`Unknown editor profile: ${profileId}.`);
			const previous = scoreInputs;
			scoreInputs = {};
			optionFilters.clear();
			if (!publish(profile.createDraft(catalog.dataset, selection))) {
				scoreInputs = previous;
				if (character) render();
			}
		},
		open (document) {
			if (!profileFor(document)) return;
			if (document !== character) {
				scoreInputs = {...document.build.abilities.scores};
				optionFilters.clear();
				character = document;
				const next = autoSelectSingleOptions(document);
				if (next !== document && onChange(next)) character = next;
			}
			render();
		},
		close () { container.hidden = true; },
	};
}
