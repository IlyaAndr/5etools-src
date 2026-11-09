import {createFighterDraft, getFighterChoiceDescriptors, isSupportedFighterDocument} from "./fighter-choices.js";

/** The first Fighter editor preset; the editor itself is class-independent. */
export const FIGHTER_EDITOR_PROFILE = {
	id: "fighter",
	title: "Fighter editor",
	scope: "2024 rules · Gnome · Soldier · Fighter · levels 1–5",
	intro: "This editor supports the listed options only: Defense fighting style, Champion, Ability Score Improvement, Dice Set, and the displayed equipment package. Hit points use the fixed value. Other choices and classes are not yet available.",
	createDraft: createFighterDraft,
	getChoiceDescriptors: getFighterChoiceDescriptors,
	isSupportedDocument: isSupportedFighterDocument,
};
