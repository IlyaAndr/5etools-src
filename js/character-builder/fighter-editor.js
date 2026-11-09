import {createFighterDraft, FIGHTER_ABILITY_SCORE_METHODS, getFighterAbilities, getFighterChoiceDescriptors, isSupportedFighterDocument, setFighterChoice} from "./fighter-choices.js";

export const FIGHTER_EDITOR_PROFILE = {
	id: "fighter",
	title: "Fighter editor",
	scope: "2024 rules · Gnome · Soldier · Fighter · levels 1–5",
	intro: "This editor supports the listed options only: Defense fighting style, Champion, Ability Score Improvement, Dice Set, and the displayed equipment package. Hit points use the fixed value. Other choices and classes are not yet available.",
	createDraft: createFighterDraft,
	getChoiceDescriptors: getFighterChoiceDescriptors,
	isSupportedDocument: isSupportedFighterDocument,
};

/** A small editor for the subset currently supported by the sheet calculator. */
export function createFighterEditor ({container, catalog, context, onChange, profiles = [FIGHTER_EDITOR_PROFILE]}) {
	const abilities = getFighterAbilities(context.sources);
	const profileFor = document => document?.build?.level >= 1 && document.build.level <= 5
		? profiles.find(profile => profile.isSupportedDocument(document))
		: undefined;
	let character;
	let scoreInputs;

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
			const target = controls.find(input => input.dataset.cbFocus === key);
			if (target) { target.focus(); return; }
		}
	}

	function publish (next, redraw = true) {
		const active = container.contains(document.activeElement) ? document.activeElement : null;
		const focusKey = active?.dataset.cbFocus;
		const fallbackKey = active?.dataset.cbFocusFallback;
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
		for (const option of options) input.add(new Option(option.label, option.id));
		input.value = selected || "";
		return input;
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
		const scores = element("fieldset", null, "cb-editor__group");
		scores.append(element("legend", "Base ability scores"));
		const scoreHelp = element("p", "Assign all six scores before background and feat increases. Standard array: 15, 14, 13, 12, 10, 8. Point buy: spend 27 points on scores from 8 to 15. Partial score entries are kept in this editor until all six are filled, but are not included in a saved JSON file.", "cb-editor__help");
		const method = select(FIGHTER_ABILITY_SCORE_METHODS, character.build.abilities.method);
		method.remove(0);
		method.dataset.cbFocus = "character:score-method";
		method.value = character.build.abilities.method;
		method.addEventListener("change", () => updateBuild({abilities: {...character.build.abilities, method: method.value}}, false));
		const scoreGrid = element("div", null, "cb-editor__scores");
		for (const ability of abilities) {
			const input = element("input");
			input.type = "number";
			input.dataset.cbFocus = `character:score:${ability.id}`;
			input.min = "1";
			input.max = "30";
			input.step = "1";
			input.value = scoreInputs[ability.id] ?? "";
			input.addEventListener("change", () => {
				const previous = {...scoreInputs};
				scoreInputs[ability.id] = input.value;
				const allScores = abilities.map(({id}) => scoreInputs[id]);
				const complete = allScores.every(value => /^\d+$/.test(`${value}`) && Number(value) >= 1 && Number(value) <= 30);
				const values = complete ? Object.fromEntries(abilities.map(({id}) => [id, Number(scoreInputs[id])])) : null;
				if (!updateBuild({abilities: {...character.build.abilities, scores: values}}, false)) {
					scoreInputs = previous;
					render();
					restoreFocus(`character:score:${ability.id}`);
				}
			});
			scoreGrid.append(field(ability.label, input));
		}
		scores.append(scoreHelp, field("Method", method), scoreGrid);
		const choices = element("div", null, "cb-editor__choices");
		const descriptors = profile.getChoiceDescriptors(character, catalog, context);
		for (const descriptor of descriptors) {
			const group = element("fieldset", null, "cb-editor__group");
			group.append(element("legend", descriptor.label));
			if (descriptor.count) group.append(element("p", `Choose ${descriptor.count}.`, "cb-editor__help"));
			if (!descriptor.available) group.append(element("p", "This choice is unavailable at the current level. Remove the retained selection to complete this character, or restore the previous level.", "cb-editor__help"));
			const options = element("div", null, "cb-editor__options");
			const displayedOptions = [...descriptor.options, ...descriptor.selected.filter(id => !descriptor.options.some(option => option.id === id)).map(id => ({id, label: `${id} (previous selection)`}))];
			if (descriptor.count === 1 && descriptor.selected.length <= 1) {
				const input = select(displayedOptions, descriptor.selected[0], "No selection");
				input.setAttribute("aria-label", descriptor.label);
				input.dataset.cbFocus = descriptor.id;
				for (const option of input.options) if (option.value && !descriptor.available && option.value !== descriptor.selected[0]) option.disabled = true;
				input.addEventListener("change", () => publish(setFighterChoice(character, descriptor.id, input.value ? [input.value] : [])));
				options.append(input);
			} else {
				for (const option of displayedOptions) {
					const label = element("label", null, "cb-editor__option");
					const input = element("input");
					input.type = "checkbox";
					input.dataset.cbFocus = `${descriptor.id}|${option.id}`;
					input.checked = descriptor.selected.includes(option.id);
					input.disabled = !descriptor.available && !input.checked;
					input.addEventListener("change", () => {
						const selected = input.checked ? [...descriptor.selected, option.id] : descriptor.selected.filter(id => id !== option.id);
						publish(setFighterChoice(character, descriptor.id, selected));
					});
					label.append(input, element("span", option.label));
					options.append(label);
				}
			}
			group.append(options);
			for (const option of descriptor.options) {
				if (context.rules.equipment[option.id]?.gear) group.append(element("p", option.label, "cb-editor__package"));
			}
			if (!descriptor.available && character.build.choices.some(choice => choice.id === descriptor.id)) {
				const remove = element("button", "Remove saved choice", "cb-button");
				remove.type = "button";
				remove.setAttribute("aria-label", `Remove saved choice ${descriptor.label}`);
				remove.dataset.cbFocus = `remove:${descriptor.id}`;
				remove.dataset.cbFocusFallback = descriptor.id;
				remove.addEventListener("click", () => publish(setFighterChoice(character, descriptor.id, [])));
				group.append(remove);
			}
			choices.append(group);
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
				remove.addEventListener("click", () => publish(setFighterChoice(character, choice.id, [])));
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
		create (profileId = "fighter") {
			const profile = profiles.find(candidate => candidate.id === profileId);
			if (!profile) throw new TypeError(`Unknown editor profile: ${profileId}.`);
			const previous = scoreInputs;
			scoreInputs = {};
			if (!publish(profile.createDraft(catalog.dataset))) {
				scoreInputs = previous;
				if (character) render();
			}
		},
		open (document) {
			if (!profileFor(document)) return;
			if (document !== character) scoreInputs = {...document.build.abilities.scores};
			character = document;
			render();
		},
		close () { container.hidden = true; },
	};
}
