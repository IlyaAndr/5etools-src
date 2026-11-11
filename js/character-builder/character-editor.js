import {
	ABILITY_SCORE_METHODS, MANUAL_SCORE_RANGE, POINT_BUY_BUDGET, POINT_BUY_COSTS, POINT_BUY_RANGE, STANDARD_ARRAY,
	applySingleOptionSelections, createScoreDrafts, getEditorAbilities, pointBuySpent, readScoreDraft, scoresForBuild, setCharacterChoice,
} from "./editor-common.js";
import {filterOptions, parseIncreaseOption} from "./choice-common.js";
import {getBackgroundEquipment} from "./background-choices.js";

/** Show a name filter once a checkbox group grows past a short, scannable list. */
const OPTION_FILTER_MINIMUM = 8;

/** The reset action of each ability-score method, matching what it clears. */
const SCORE_RESET_LABELS = {
	standard: "Clear all assignments",
	pointBuy: "Reset all to 8",
	manual: "Clear all scores",
};

/** Radio groups of separate editors must not share a name. */
let scoreMethodGroups = 0;

const isBackgroundIncrease = descriptor => descriptor.id.startsWith("background:") && descriptor.id.endsWith(":ability-increases");

/** A small editor for the subset currently supported by the sheet calculator. */
export function createCharacterEditor ({container, catalog, context, onChange, profiles}) {
	const abilities = getEditorAbilities(context.sources);
	const profileFor = document => document?.build?.level >= 1 && document.build.level <= 5
		? profiles.find(profile => profile.isSupportedDocument(document))
		: undefined;
	const methodGroup = `cb-score-method-${++scoreMethodGroups}`;
	let character;
	let scoreDrafts;
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
			const target = controls.find(input => input.dataset.cbFocus === key && !input.closest("[hidden]") && !input.disabled);
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

	function publish (next, redraw = true, focusHint = null, fallbackHint = null) {
		const active = container.contains(document.activeElement) ? document.activeElement : null;
		const focusKey = focusHint || active?.dataset.cbFocus;
		const fallbackKey = fallbackHint || active?.dataset.cbFocusFallback;
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

	/** A method's neutral draft: no array value, base point-buy scores, or manual entries. */
	function emptyDraft (method) {
		const fallback = method === "pointBuy" ? POINT_BUY_RANGE.min : method === "manual" ? "" : null;
		return Object.fromEntries(abilities.map(({id}) => [id, fallback]));
	}

	/**
	 * The first visit to a method converts the scores on screen; later visits
	 * keep that method's own entries, so switching back never loses work.
	 */
	function methodDraft (method) {
		if (scoreDrafts?.[method]) return scoreDrafts[method];
		const converted = createScoreDrafts(abilities.map(({id}) => id), character?.build.abilities.scores)[method];
		scoreDrafts = {...scoreDrafts, [method]: converted};
		return converted;
	}

	/** Save a draft as the method's scores, and restore it if the change is rejected. */
	function commitScores (method, draft, focusKey, fallbackKey) {
		const previous = methodDraft(method);
		scoreDrafts = {...scoreDrafts, [method]: draft};
		const scores = scoresForBuild(method, abilities.map(({id}) => id), draft);
		const next = {...character, build: {...character.build, abilities: {...character.build.abilities, method, scores}}};
		if (publish(next, true, focusKey, fallbackKey)) return true;
		scoreDrafts = {...scoreDrafts, [method]: previous};
		render();
		restoreFocus(focusKey, fallbackKey);
		return false;
	}

	/** Switch methods without discarding either method's entries. */
	function commitMethod (method) {
		const scores = scoresForBuild(method, abilities.map(({id}) => id), methodDraft(method));
		publish({...character, build: {...character.build, abilities: {...character.build.abilities, method, scores}}}, true, `character:score-method:${method}`);
	}

	function select (options, selected, emptyLabel = "Choose…") {
		const input = document.createElement("select");
		input.append(new Option(emptyLabel, ""));
		for (const option of options) input.add(new Option(option.detail ? `${option.label} · ${option.detail}` : option.label, option.id));
		input.value = selected || "";
		return input;
	}

	/** Say what the selected method still needs, and whether an entry is outside its range. */
	function scoreSummary (method, values) {
		const ids = abilities.map(({id}) => id);
		const entered = ids.filter(id => values[id] != null);
		if (method === "pointBuy") {
			const spent = pointBuySpent(values);
			return spent === POINT_BUY_BUDGET
				? {text: `All ${POINT_BUY_BUDGET} points are spent.`}
				: {text: `${spent} of ${POINT_BUY_BUDGET} points spent. ${POINT_BUY_BUDGET - spent} left.`};
		}
		if (method === "manual") {
			const invalid = entered.filter(id => values[id] < MANUAL_SCORE_RANGE.min || values[id] > MANUAL_SCORE_RANGE.max);
			if (invalid.length) return {text: `${invalid.length} of ${ids.length} scores must be between ${MANUAL_SCORE_RANGE.min} and ${MANUAL_SCORE_RANGE.max}.`, invalid: true};
			if (entered.length < ids.length) return {text: `${entered.length} of ${ids.length} scores entered.`};
			return {text: `All six scores are within ${MANUAL_SCORE_RANGE.min}–${MANUAL_SCORE_RANGE.max}.`};
		}
		const left = [...STANDARD_ARRAY];
		for (const id of entered) {
			const index = left.indexOf(values[id]);
			if (index !== -1) left.splice(index, 1);
		}
		return entered.length === ids.length
			? {text: "All six standard-array values are assigned."}
			: {text: `${entered.length} of ${ids.length} assigned. Values left: ${left.join(", ")}.`};
	}

	/** Show the combined result of the base scores and the reviewed increases. */
	function finalScoreNodes (descriptors, values) {
		const amounts = Object.fromEntries(abilities.map(({id}) => [id, []]));
		for (const descriptor of descriptors.filter(entry => entry.available && entry.id.endsWith("ability-increases"))) {
			const [selected] = character.build.choices.find(choice => choice.id === descriptor.id)?.selected || [];
			for (const {ability, amount} of parseIncreaseOption(selected) || []) amounts[ability].push(amount);
		}
		const grid = element("div", null, "cb-editor__scores cb-editor__final-scores");
		for (const ability of abilities) {
			const parts = amounts[ability.id];
			// Preview only scores the saved document supports, so an out-of-range
			// manual entry never looks like an accepted total.
			const raw = values[ability.id];
			const base = raw == null || raw < MANUAL_SCORE_RANGE.min || raw > MANUAL_SCORE_RANGE.max ? null : raw;
			const total = base == null ? null : base + parts.reduce((sum, value) => sum + value, 0);
			const modifier = total == null ? "" : Math.floor((total - 10) / 2);
			const cell = element("div", null, "cb-editor__final-score");
			cell.append(element("span", ability.label, "cb-editor__final-label"));
			cell.append(element("strong", total == null ? "—" : `${total} (${modifier >= 0 ? "+" : ""}${modifier})`, "cb-editor__final-value"));
			if (parts.length && base != null) cell.append(element("small", `${base} + ${parts.join(" + ")}`, "cb-editor__final-detail"));
			grid.append(cell);
		}
		return [element("p", "Final scores after background and level increases", "cb-editor__help"), grid];
	}

	/** Describe the three methods as radios, because the choice changes the controls below it. */
	function renderMethods (method) {
		const methods = element("fieldset", null, "cb-editor__methods");
		methods.append(element("legend", "Method"));
		for (const entry of ABILITY_SCORE_METHODS) {
			const label = element("label", null, "cb-editor__method");
			const radio = element("input");
			radio.type = "radio";
			radio.name = methodGroup;
			radio.value = entry.id;
			radio.checked = entry.id === method;
			radio.setAttribute("aria-label", entry.label);
			radio.dataset.cbFocus = `character:score-method:${entry.id}`;
			radio.addEventListener("change", () => { if (radio.checked) commitMethod(entry.id); });
			label.append(radio, element("span", entry.label, "cb-editor__method-name"), element("span", entry.note, "cb-editor__method-note"));
			methods.append(label);
		}
		return methods;
	}

	/** Choose a standard-array value from the ones no other ability uses. */
	function standardField (ability) {
		const draft = methodDraft("standard");
		const input = element("select");
		input.dataset.cbFocus = `character:score:${ability.id}`;
		input.append(new Option("Choose…", ""));
		for (const value of STANDARD_ARRAY) {
			const owner = abilities.find(entry => draft[entry.id] === value);
			const option = new Option(owner && owner.id !== ability.id ? `${value} · used by ${owner.label}` : `${value}`, `${value}`);
			option.disabled = !!owner && owner.id !== ability.id;
			input.append(option);
		}
		input.value = draft[ability.id] == null ? "" : `${draft[ability.id]}`;
		input.addEventListener("change", () => commitScores("standard", {...draft, [ability.id]: input.value ? Number(input.value) : null}, `character:score:${ability.id}`));
		return field(ability.label, input);
	}

	/** Spend points with buttons, so the budget cannot be exceeded and no arithmetic is needed. */
	function pointBuyField (ability) {
		const draft = methodDraft("pointBuy");
		const value = draft[ability.id];
		const spent = pointBuySpent(draft);
		const wrapper = element("div", null, "cb-editor__field");
		wrapper.append(element("span", ability.label));
		const stepper = element("div", null, "cb-editor__stepper");
		const decrease = element("button", "−", "cb-editor__stepper-button");
		decrease.type = "button";
		decrease.disabled = value <= POINT_BUY_RANGE.min;
		decrease.setAttribute("aria-label", `Decrease ${ability.label}`);
		decrease.dataset.cbFocus = `character:score:${ability.id}:decrease`;
		decrease.dataset.cbFocusFallback = `character:score:${ability.id}:increase`;
		decrease.addEventListener("click", () => commitScores("pointBuy", {...draft, [ability.id]: value - 1}, decrease.dataset.cbFocus, increase.dataset.cbFocus));
		const increase = element("button", "+", "cb-editor__stepper-button");
		increase.type = "button";
		increase.disabled = value >= POINT_BUY_RANGE.max || spent + (POINT_BUY_COSTS[value + 1] - POINT_BUY_COSTS[value]) > POINT_BUY_BUDGET;
		increase.setAttribute("aria-label", `Increase ${ability.label}`);
		increase.dataset.cbFocus = `character:score:${ability.id}:increase`;
		increase.dataset.cbFocusFallback = `character:score:${ability.id}:decrease`;
		increase.addEventListener("click", () => commitScores("pointBuy", {...draft, [ability.id]: value + 1}, increase.dataset.cbFocus, decrease.dataset.cbFocus));
		stepper.append(decrease, element("output", `${value}`, "cb-editor__stepper-value"), increase);
		wrapper.append(stepper, element("small", `${POINT_BUY_COSTS[value]} ${POINT_BUY_COSTS[value] === 1 ? "point" : "points"}`, "cb-editor__score-cost"));
		return wrapper;
	}

	/** Accept any score the table uses, and flag entries outside 1–20 instead of coercing them. */
	function manualField (ability) {
		const input = element("input");
		input.type = "number";
		input.min = `${MANUAL_SCORE_RANGE.min}`;
		input.max = `${MANUAL_SCORE_RANGE.max}`;
		input.step = "1";
		input.value = methodDraft("manual")[ability.id] ?? "";
		input.dataset.cbFocus = `character:score:${ability.id}`;
		input.addEventListener("change", () => commitScores("manual", {...methodDraft("manual"), [ability.id]: input.value}, `character:score:${ability.id}`));
		return field(ability.label, input);
	}

	/** Render the method chooser, its method-specific controls, and the combined totals. */
	function renderScores (descriptors) {
		const ids = abilities.map(({id}) => id);
		const method = character.build.abilities.method;
		const draft = methodDraft(method);
		const fieldset = element("fieldset", null, "cb-editor__group");
		fieldset.append(element("legend", "Base ability scores"));
		fieldset.append(element("p", "Pick how the six scores are assigned. They enter the saved character as soon as all six fit the method; until then the sheet stays incomplete.", "cb-editor__help"), renderMethods(method));
		const grid = element("div", null, "cb-editor__scores");
		const manualInputs = {};
		for (const ability of abilities) {
			if (method === "manual") {
				const wrapper = manualField(ability);
				manualInputs[ability.id] = wrapper.querySelector("input");
				grid.append(wrapper);
			} else grid.append(method === "pointBuy" ? pointBuyField(ability) : standardField(ability));
		}
		fieldset.append(grid);
		const status = element("p", null, "cb-editor__score-status");
		status.setAttribute("aria-live", "polite");
		const reset = element("button", SCORE_RESET_LABELS[method], "cb-editor__score-reset");
		reset.type = "button";
		reset.dataset.cbFocus = "character:score-reset";
		reset.addEventListener("click", () => commitScores(method, emptyDraft(method), "character:score-reset"));
		const summary = element("div", null, "cb-editor__score-summary");
		if (method === "pointBuy") {
			const budget = element("progress", null, "cb-editor__score-budget");
			budget.max = POINT_BUY_BUDGET;
			budget.value = pointBuySpent(draft);
			budget.setAttribute("aria-label", `Points spent of ${POINT_BUY_BUDGET}`);
			summary.append(budget);
		}
		summary.append(status, reset);
		fieldset.append(summary);
		const backgroundIncrease = descriptors.find(isBackgroundIncrease);
		if (backgroundIncrease) {
			const group = renderChoiceGroup(backgroundIncrease);
			if (group) fieldset.append(group);
		}
		const final = element("div", null, "cb-editor__final");
		fieldset.append(final);
		const readValues = () => method === "manual"
			? readScoreDraft(ids, Object.fromEntries(ids.map(id => [id, manualInputs[id].value])))
			: readScoreDraft(ids, draft);
		const refresh = () => {
			const values = readValues();
			const feedback = scoreSummary(method, values);
			status.textContent = feedback.text;
			status.classList.toggle("cb-editor__score-status--invalid", !!feedback.invalid);
			for (const id of ids) {
				const input = manualInputs[id];
				if (!input) continue;
				if (values[id] != null && (values[id] < MANUAL_SCORE_RANGE.min || values[id] > MANUAL_SCORE_RANGE.max)) input.setAttribute("aria-invalid", "true");
				else input.removeAttribute("aria-invalid");
			}
			final.replaceChildren(...finalScoreNodes(descriptors, values));
		};
		for (const input of Object.values(manualInputs)) input.addEventListener("input", refresh);
		refresh();
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
			const previous = scoreDrafts;
			scoreDrafts = {};
			optionFilters.clear();
			if (!publish(profile.createDraft(catalog.dataset, selection))) {
				scoreDrafts = previous;
				if (character) render();
			}
		},
		open (document) {
			if (!profileFor(document)) return;
			if (document !== character) {
				scoreDrafts = {};
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
