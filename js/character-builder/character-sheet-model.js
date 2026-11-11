import {ABILITY_IDS, validateCharacterDocument} from "./character-document.js";
import {parseIncreaseOption} from "./choice-common.js";
import {projectSpecies} from "./species-projection.js";
import {resolveMechanicEffects} from "./rules/effects.js";
import {planSpellcastingChoices} from "./spellcasting-choice.js";
import {createSkillCatalog} from "./skill-catalog.js";
import {getFighterSourceChoices} from "./fighter-choices.js";
import {getWarlockSourceChoices, getAvailableInvocations} from "./warlock-choices.js";
import {getEditorChoiceDescriptors} from "./editor-profile.js";
import {resolveStartingEquipment} from "./equipment-choices.js";
import {getBackgroundSourceChoices} from "./source-choices.js";

const copy = value => JSON.parse(JSON.stringify(value));
const key = ref => `${ref.name.toLowerCase().replaceAll(" ", "-")}|${ref.source.toLowerCase()}`;
const modifier = score => Math.floor((score - 10) / 2);
const signed = value => `${value >= 0 ? "+" : ""}${value}`;

function checkRules (rules, document) {
	if (rules.schemaVersion !== 1 || rules.ruleset !== document.ruleset) throw new TypeError("sheetRules: unsupported version or ruleset");
	if (["id", "version", "revision"].some(field => rules.dataset?.[field] !== document.dataset[field])) throw new TypeError("sheetRules.dataset: does not match the character's pinned dataset");
	for (const field of ["classes", "backgrounds", "feats", "weapons", "equipment", "invocations", "pactWeapons", "standardLanguages"]) {
		if (!rules[field] || typeof rules[field] !== "object" || Array.isArray(rules[field])) throw new TypeError(`sheetRules.${field}: missing reviewed records`);
	}
	for (const record of Object.values(rules.classes)) {
		if (!Array.isArray(record.levels) || !record.levels.length || record.levels.length > 20 || !Number.isSafeInteger(record.hitDie) || record.hitDie < 2 || record.hitDie > 100 || record.hitDie % 2) throw new TypeError("sheetRules.classes: unsupported class progression");
	}
	for (const [id, feat] of Object.entries(rules.feats)) {
		if (!feat || typeof feat !== "object" || Array.isArray(feat) || typeof feat.name !== "string"
			|| !feat.record || typeof feat.record.name !== "string" || typeof feat.record.source !== "string") throw new TypeError(`sheetRules.feats.${id}: unsupported feat annotation`);
		if (feat.spellGroup !== undefined && (typeof feat.spellGroup !== "string"
			|| !Array.isArray(feat.abilities) || !Array.isArray(feat.cantrips) || !Array.isArray(feat.spells))) throw new TypeError(`sheetRules.feats.${id}: unsupported spell choices`);
	}
	for (const [id, invocation] of Object.entries(rules.invocations)) {
		if (!invocation || typeof invocation !== "object" || Array.isArray(invocation) || typeof invocation.name !== "string" || !invocation.name.trim()
			|| !Number.isSafeInteger(invocation.minimumLevel) || invocation.minimumLevel < 1 || invocation.minimumLevel > 20) throw new TypeError(`sheetRules.invocations.${id}: unsupported invocation annotation`);
		if (invocation.requires !== undefined && (!Array.isArray(invocation.requires) || !invocation.requires.length
			|| invocation.requires.some(value => typeof value !== "string" || value === id || !rules.invocations[value]))) throw new TypeError(`sheetRules.invocations.${id}: unsupported prerequisite`);
		if (invocation.unsupported !== undefined && (typeof invocation.unsupported !== "string" || !invocation.unsupported.trim())) throw new TypeError(`sheetRules.invocations.${id}: unsupported invocation reason`);
		if (invocation.repeatable !== undefined && typeof invocation.repeatable !== "boolean") throw new TypeError(`sheetRules.invocations.${id}: unsupported repeatable flag`);
		if (invocation.cantripChoice !== undefined && (typeof invocation.cantripChoice !== "string" || !invocation.cantripChoice.trim()
			|| !Array.isArray(invocation.cantripOptions) || !invocation.cantripOptions.length || invocation.cantripOptions.some(value => typeof value !== "string"))) throw new TypeError(`sheetRules.invocations.${id}: unsupported cantrip choice`);
		if (invocation.cantripChoice === undefined && invocation.cantripOptions !== undefined) throw new TypeError(`sheetRules.invocations.${id}: cantrip options without a choice`);
		if (invocation.weaponChoice !== undefined && (typeof invocation.weaponChoice !== "string" || !invocation.weaponChoice.trim()
			|| !Array.isArray(invocation.weaponOptions) || !invocation.weaponOptions.length || invocation.weaponOptions.some(value => typeof value !== "string" || !rules.pactWeapons[value]))) throw new TypeError(`sheetRules.invocations.${id}: unsupported weapon choice`);
		if (invocation.weaponChoice === undefined && invocation.weaponOptions !== undefined) throw new TypeError(`sheetRules.invocations.${id}: weapon options without a choice`);
		if (invocation.pactWeaponExtraAttacks !== undefined && (!Number.isSafeInteger(invocation.pactWeaponExtraAttacks)
			|| invocation.pactWeaponExtraAttacks < 1 || invocation.pactWeaponExtraAttacks > 2)) throw new TypeError(`sheetRules.invocations.${id}: unsupported pact weapon extra attacks`);
	}
	for (const [id, weapon] of Object.entries(rules.pactWeapons)) {
		if (!weapon || typeof weapon !== "object" || Array.isArray(weapon)
			|| typeof weapon.name !== "string" || !weapon.name.trim()
			|| typeof weapon.damage !== "string" || typeof weapon.type !== "string" || typeof weapon.range !== "string") throw new TypeError(`sheetRules.pactWeapons.${id}: unsupported pact weapon annotation`);
	}
	for (const [id, background] of Object.entries(rules.backgrounds)) {
		if (!background || typeof background !== "object" || Array.isArray(background)
			|| typeof background.featId !== "string" || !rules.feats[background.featId]) throw new TypeError(`sheetRules.backgrounds.${id}: missing reviewed feat mapping`);
		if (!background.equipment || typeof background.equipment !== "object" || Array.isArray(background.equipment)
			|| typeof background.equipment.cost !== "number" || background.equipment.cost < 0
			|| !Array.isArray(background.equipment.gear) || background.equipment.gear.some(item => typeof item !== "string")) throw new TypeError(`sheetRules.backgrounds.${id}: unsupported equipment annotation`);
	}
}

/**
 * Calculate the reviewed sheet for the class levels covered by the sheet rules
 * (Warlock 1–20, Fighter 1–5). Build decisions live in the v1 document;
 * numerical results never depend on an example ID or name. Unsupported
 * decisions produce an incomplete draft.
 */
export function createCharacterSheetModel (document, catalog, {rules, spells, sources} = {}) {
	validateCharacterDocument(document);
	const species = projectSpecies(document, catalog);
	const {build, session} = document;
	const model = {
		status: "incomplete",
		document: copy(document),
		species: copy(species),
		className: build.class.name,
		subclassName: null,
		issues: species.unresolvedChoices.map(choice => ({id: choice.id, message: "Complete the species selection."})),
		abilities: [],
		proficiencyBonus: species.proficiencyBonus,
		size: species.size,
		speed: species.speed,
		darkvision: species.darkvision,
		resources: [],
		features: [],
		defenses: [],
		training: [],
		gear: [],
		languages: [],
		spells: [],
		spellcasting: [],
		attacks: [],
	};
	const issue = (id, message) => model.issues.push({id, message});
	if (!rules) {
		issue("sheet-rules", "Complete character calculations require the reviewed sheet rules.");
		return model;
	}
	checkRules(rules, document);
	const classId = key(build.class);
	const classRule = rules.classes[classId];
	const backgroundId = build.background ? key(build.background) : null;
	const background = rules.backgrounds[backgroundId];
	const featRule = background?.featId ? rules.feats?.[background.featId] : null;
	if (!classRule) issue("class", "This class and source are outside the reviewed sheet subset.");
	if (!background) issue("background", "Choose a supported background: Soldier or Acolyte (2024).");
	if (!classRule || !background) return model;
	if (!featRule || featRule.name !== background.feat) throw new TypeError("sheetRules.backgrounds: missing or inconsistent feat annotation.");
	const featOwner = `feat:${background.featId}`;
	if (!["Fighter", "Warlock"].includes(classRule.name)) {
		issue("class", "This class choice profile is outside the reviewed sheet subset.");
		return model;
	}
	model.className = classRule.name;
	const reviewedLevelRule = classRule.levels[build.level - 1];
	if (!reviewedLevelRule) {
		issue("level", "This class level is outside the reviewed sheet coverage.");
		return model;
	}
	const classOwner = `class:${classId}`;
	const backgroundOwner = `background:${backgroundId}`;
	const decisions = new Map(build.choices.map(choice => [choice.id, choice.selected]));
	const consumed = new Set(build.choices.filter(choice => choice.id.startsWith(`${species.speciesId}:`)).map(choice => choice.id));
	const hasChoiceCatalog = sources?.skills && sources?.abilityNames;
	const classSources = classId === "fighter|xphb" ? sources?.fighter : classId === "warlock|xphb" ? sources?.warlock : null;
	if (hasChoiceCatalog && (!classSources?.class || !sources?.backgrounds?.background || (featRule.spellGroup && !sources?.feats?.feat))) {
		issue("source-descriptions", "Original feature descriptions are unavailable. Reload the source data.");
		return model;
	}
	const fighterSourceChoices = hasChoiceCatalog && classId === "fighter|xphb" ? getFighterSourceChoices(sources) : null;
	const warlockSourceChoices = hasChoiceCatalog && classId === "warlock|xphb" ? getWarlockSourceChoices(sources) : null;
	const classSourceChoices = fighterSourceChoices || warlockSourceChoices;
	const backgroundSourceChoices = hasChoiceCatalog ? getBackgroundSourceChoices(sources, build.background) : null;
	const featRecords = (sources?.feats?.feat || []).filter(candidate => candidate.name === featRule.record.name && candidate.source === featRule.record.source);
	const rawFeat = featRecords.length === 1 ? featRecords[0] : null;
	const featOptions = featRule.spellGroup ? rawFeat?.additionalSpells?.find(group => group.name === featRule.spellGroup)?.ability?.choose : null;
	if (hasChoiceCatalog && featRule.spellGroup && (!Array.isArray(featOptions) || !featOptions.length || featOptions.some(ability => !ABILITY_IDS.includes(ability)))) {
		issue("source-descriptions", "Original feature descriptions are unavailable. Reload the source data.");
		return model;
	}
	const levelRule = warlockSourceChoices ? {...reviewedLevelRule, ...warlockSourceChoices.progression(build.level)} : reviewedLevelRule;
	const descriptors = hasChoiceCatalog ? getEditorChoiceDescriptors(document, catalog, {rules, sources, spells: spells || []}) : [];
	const sharedChoices = new Map(descriptors.map(descriptor => [descriptor.id, descriptor]));
	function select (id, options, count, label) {
		consumed.add(id);
		const selected = decisions.get(id) || [];
		const descriptor = sharedChoices.get(id);
		const allowed = descriptor ? descriptor.options.map(option => option.id) : options;
		const expectedCount = descriptor ? descriptor.count : count;
		const requiredIds = descriptor?.required || [];
		if (selected.length !== expectedCount || selected.some(value => !allowed.includes(value)) || requiredIds.some(value => !selected.includes(value))) {
			issue(id, `${label}: choose ${expectedCount} supported ${expectedCount === 1 ? "option" : "options"}.`);
		}
		return selected.filter(value => allowed.includes(value));
	}
	function increases (id, allowed, scores, isBackground) {
		consumed.add(id);
		const selected = decisions.get(id) || [];
		const descriptor = sharedChoices.get(id);
		if (descriptor && (selected.length !== descriptor.count || selected.some(value => !descriptor.options.some(option => option.id === value)))) {
			issue(id, "Choose a supported ability increase.");
			return;
		}
		const values = selected.length === 1 ? parseIncreaseOption(selected[0]) : null;
		const total = (values || []).reduce((sum, value) => sum + value.amount, 0);
		if (!values || values.some(value => !allowed.includes(value.ability)) || total !== (isBackground ? 3 : 2)
			|| (isBackground && values.length !== 2 && values.length !== 3)
			|| (isBackground && backgroundSourceChoices && !backgroundSourceChoices.backgroundWeights.some(weighted => values.every(value => weighted.from.includes(value.ability)) && values.map(value => value.amount).sort().join() === [...weighted.weights].sort().join()))) {
			issue(id, isBackground ? "Select +2/+1 to two background abilities, or +1 to all three." : "Select a +2 ability increase or +1 to two abilities.");
			return;
		}
		for (const value of values) {
			if (scores[value.ability] + value.amount > 20) issue(id, "An ability increase cannot raise a score above 20.");
			scores[value.ability] += value.amount;
		}
	}
	const scores = build.abilities.scores ? {...build.abilities.scores} : Object.fromEntries(ABILITY_IDS.map(id => [id, 0]));
	if (!build.abilities.scores) issue("ability-scores", "Assign the six base ability scores.");
	else if (Object.values(scores).some(score => score > 20)) issue("ability-scores", "This subset supports base ability scores from 1 to 20; no ability cap increase is implemented.");
	else if (build.abilities.method === "standard" && Object.values(scores).sort((a, b) => a - b).join(",") !== "8,10,12,13,14,15") issue("ability-scores", "The standard array is 15, 14, 13, 12, 10, 8 before increases.");
	else if (build.abilities.method === "pointBuy") {
		const costs = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9};
		if (Object.values(scores).some(score => costs[score] === undefined) || Object.values(scores).reduce((sum, score) => sum + (costs[score] ?? 100), 0) !== 27) issue("ability-scores", "Point buy requires scores from 8 to 15 costing 27 points.");
	}
	increases(`${backgroundOwner}:ability-increases`, backgroundSourceChoices?.backgroundAbilityIds || background.abilities, scores, true);
	const backgroundSkills = backgroundSourceChoices?.backgroundSkills || background.skills;
	const classSkills = select(`${classOwner}:skills`, classSourceChoices?.classSkills || classRule.skillOptions, classSourceChoices?.classSkillCount || 2, "Class skills");
	if (classSkills.some(skill => backgroundSkills.includes(skill))) issue(`${classOwner}:skills`, "Choose class skills distinct from the background proficiencies; replacement choices are outside this subset.");
	const skillProficiencies = new Set([...backgroundSkills, ...classSkills]);
	const languages = select("character:languages", Object.keys(rules.standardLanguages), 3, "Languages");
	if (!languages.includes("common")) issue("character:languages", "Common and two other Standard languages are required.");
	let backgroundTool = background.tool;
	if (background.toolOptions) {
		const [tool] = select(`${backgroundOwner}:tool`, Object.keys(background.toolOptions), 1, "Background tool");
		backgroundTool = background.toolOptions[tool];
	}
	if (build.level >= 3) {
		const [subclass] = select(`${classOwner}:subclass`, [classRule.subclass.id], 1, "Subclass");
		if (subclass) model.subclassName = classRule.subclass.name;
	}
	if (build.level >= 4) {
		select(`${classOwner}:level-4-feat`, ["ability-score-improvement|xphb"], 1, "Level 4 feat");
		increases(`${classOwner}:level-4-ability-increases`, ABILITY_IDS, scores, false);
	}
	const equipmentIds = Object.entries(rules.equipment).filter(([, value]) => value.classId === classId).map(([id]) => id);
	if (!equipmentIds.length) issue(`${classOwner}:equipment`, "No reviewed starting equipment is available for this class.");
	const [equipmentId] = select(`${classOwner}:equipment`, equipmentIds, 1, "Equipment purchase");
	const equipment = equipmentId ? resolveStartingEquipment(document, rules, equipmentId) : null;
	if (equipment && equipment.cost > classRule.gold + background.gold) issue(`${classOwner}:equipment`, "The selected equipment exceeds the starting gold budget.");
	let masteries = [];
	let invocations = [];
	let cantrips = [];
	let prepared = [];
	const invocationCantrips = new Map();
	let initiateAbility;
	let initiateCantrips = [];
	let initiateSpell;
	let pactWeapon = null;
	if (featRule.spellGroup) {
		[initiateAbility] = select(`${featOwner}:ability`, featOptions || featRule.abilities, 1, "Magic Initiate ability");
		initiateCantrips = select(`${featOwner}:cantrips`, featRule.cantrips, featRule.cantrips.length, "Magic Initiate cantrips");
		[initiateSpell] = select(`${featOwner}:spell`, featRule.spells, 1, "Magic Initiate level 1 spell");
	}
	if (classRule.name === "Fighter") {
		select(`${classOwner}:fighting-style`, ["defense|xphb"], 1, "Fighting Style");
		masteries = select(`${classOwner}:weapon-masteries`, Object.keys(rules.weapons), fighterSourceChoices?.masteries(build.level) || levelRule.masteries, "Weapon Mastery");
	} else {
		cantrips = select(`${classOwner}:cantrips`, classRule.cantripOptions, levelRule.cantrips, "Warlock cantrips");
		prepared = select(`${classOwner}:prepared-spells`, classRule.preparedOptions, levelRule.prepared, "Prepared Warlock spells");
		const selectedInvocations = decisions.get(`${classOwner}:invocations`) || [];
		invocations = select(`${classOwner}:invocations`, getAvailableInvocations(rules, build.level, selectedInvocations).map(([id]) => id), levelRule.invocations, "Eldritch Invocations");
		for (const id of selectedInvocations) {
			const annotation = rules.invocations[id];
			if (annotation?.unsupported) issue(`${classOwner}:invocations`, `${annotation.name}: ${annotation.unsupported}`);
		}
		for (const id of invocations) {
			const invocation = rules.invocations[id];
			if (!invocation.cantripChoice) continue;
			const [cantrip] = select(`${classOwner}:${invocation.cantripChoice}`, invocation.cantripOptions, 1, invocation.name);
			if (cantrip && !cantrips.includes(cantrip)) issue(`${classOwner}:${invocation.cantripChoice}`, "The invocation must affect a known Warlock cantrip.");
			invocationCantrips.set(id, cantrip);
		}
		for (const id of invocations) {
			const invocation = rules.invocations[id];
			if (!invocation.weaponChoice) continue;
			const [weaponId] = select(`${classOwner}:${invocation.weaponChoice}`, invocation.weaponOptions, 1, "Pact Weapon");
			pactWeapon = weaponId ? rules.pactWeapons[weaponId] : null;
		}
	}
	// Devouring Blade replaces the extra attack of Thirsting Blade with two
	// instead of one, so the known invocations contribute their best bonus
	// rather than a sum.
	const pactExtraAttacks = invocations.reduce((best, id) => Math.max(best, rules.invocations[id].pactWeaponExtraAttacks || 0), 0);
	for (const id of decisions.keys()) {
		if (!consumed.has(id)) issue(id, "This build decision is outside the reviewed sheet subset or unavailable at this level.");
	}
	const rawSpells = spells?.spell || spells || [];
	if (!Array.isArray(rawSpells)) throw new TypeError("spells: expected the parsed spell data or an array");
	const spellIndex = new Map(catalog.spells.map(spell => [spell.id, spell]));
	for (const spell of rawSpells) {
		const id = `spell:${key(spell)}`;
		if (spellIndex.has(id) && !spellIndex.get(id).ref) throw new TypeError(`spells: duplicate reference ${id}`);
		spellIndex.set(id, spell);
	}
	const selectedCantrips = decisions.get(`${classOwner}:cantrips`) || [];
	const selectedPrepared = decisions.get(`${classOwner}:prepared-spells`) || [];
	for (const id of new Set([...selectedCantrips, ...selectedPrepared, ...initiateCantrips, ...(initiateSpell ? [initiateSpell] : [])])) {
		const spell = spellIndex.get(id);
		if (!spell) issue(id, "Spell metadata is unavailable for this source.");
		else if (selectedCantrips.includes(id) && spell.level !== 0) issue(id, "A selected cantrip is not level 0.");
		else if (selectedPrepared.includes(id) && (spell.level < 1 || spell.level > levelRule.slotLevel)) issue(id, "A prepared spell exceeds the available Pact Magic slot level.");
	}
	const classData = classRule.name === "Fighter" ? sources?.fighter : sources?.warlock;
	const rawClass = classData?.class?.find(candidate => candidate.name === build.class.name && candidate.source === build.class.source);
	const catalogSpecies = catalog.species.find(candidate => candidate.id === species.speciesId);
	const lineageId = catalogSpecies && (decisions.get(catalogSpecies.lineageChoiceId) || [])[0];
	const selectedLineage = catalogSpecies?.lineages.find(candidate => candidate.id === lineageId);
	if (selectedLineage && rawClass && (!featRule.spellGroup || Array.isArray(featOptions))) {
		const castingChoices = [{id: species.speciesId, allowed: [...selectedLineage.abilityOptions], selected: species.spellcastingAbility}];
		if (rawClass.spellcastingAbility) castingChoices.push({id: classOwner, allowed: [rawClass.spellcastingAbility], selected: rawClass.spellcastingAbility});
		if (featOptions) castingChoices.push({id: featOwner, allowed: [...featOptions], selected: initiateAbility || null});
		model.spellcastingChoicePlan = planSpellcastingChoices({sources: castingChoices, abilityScores: scores});
	}
	if (model.issues.length) return model;

	const mods = Object.fromEntries(ABILITY_IDS.map(id => [id, modifier(scores[id])]));
	const pb = species.proficiencyBonus;
	if (!sources?.races?.race || !classData?.class || !classData?.classFeature || !classData?.subclassFeature || !rawClass
		|| !sources?.optionalFeatures?.optionalfeature || !sources?.feats?.feat || !sources?.itemMasteries?.itemMastery) {
		issue("source-descriptions", "Original feature descriptions are unavailable. Reload the source data.");
		return model;
	}
	if (!sources?.skills) {
		issue("source-skills", "Skill source data are unavailable. Reload the source data.");
		return model;
	}
	if (!sources.abilityNames) {
		issue("source-ability-names", "Ability names are unavailable. Reload the source data.");
		return model;
	}
	const abilityGroups = createSkillCatalog(sources.skills, sources.abilityNames);
	const classHitDie = rawClass.hd?.faces;
	const classSavingThrows = rawClass.proficiency;
	if (rawClass.hd?.number !== 1 || !Number.isSafeInteger(classHitDie) || classHitDie < 2 || classHitDie > 100 || classHitDie % 2
		|| !Array.isArray(classSavingThrows) || classSavingThrows.some(ability => !ABILITY_IDS.includes(ability))) throw new TypeError("Unsupported original class hit die or saving throws.");
	const originalSources = {
		classFeature: classData.classFeature,
		subclassFeature: classData.subclassFeature,
		feat: sources.feats.feat,
		optionalfeature: sources.optionalFeatures.optionalfeature,
		spell: rawSpells,
		race: sources.races.race,
	};
	const effects = resolveMechanicEffects(rules.mechanics, {
		skillIds: new Set(abilityGroups.flatMap(group => group.skills.map(skill => skill.id))),
		classId,
		backgroundId,
		subclassId: (decisions.get(`${classOwner}:subclass`) || [])[0] || null,
		level: build.level,
		invocations,
		knownSpells: [...cantrips, ...prepared, ...initiateCantrips, ...(initiateSpell ? [initiateSpell] : []), ...species.spells.map(spell => spell.id)],
		wearingArmor: equipment.armor.worn !== false,
		choices: decisions,
		hasSource: source => (originalSources[source.type] || []).filter(candidate => ["name", "source", "page", "className", "classSource", "subclassShortName", "subclassSource", "level"].every(field => source[field] === undefined || source[field] === candidate[field])).length === 1,
		refs: {level: fighterSourceChoices ? {...levelRule, secondWind: fighterSourceChoices.secondWind(build.level), masteries: fighterSourceChoices.masteries(build.level)} : levelRule, characterLevel: build.level, modifiers: mods, initiateSpell, initiateAbility, initiateModifier: initiateAbility ? mods[initiateAbility] : null},
	});
	const effectsOf = type => effects.filter(effect => effect.type === type);
	model.abilities = abilityGroups.map(({id, name, skills}) => ({
		id,
		name,
		score: scores[id],
		modifier: mods[id],
		save: mods[id] + (classSavingThrows.includes(id) ? pb : 0),
		saveProficient: classSavingThrows.includes(id),
		savingThrowAdvantages: species.savingThrowAdvantages.filter(advantage => advantage.ability === id).map(advantage => ({...advantage})),
		skills: skills.map(({id: skillId, name: skillName}) => ({id: skillId, name: skillName, modifier: mods[id] + (skillProficiencies.has(skillId) ? pb : 0), proficient: skillProficiencies.has(skillId), advantage: effectsOf("skillAdvantage").some(effect => effect.skill === skillId), disadvantage: skillId === "stealth" && equipment.armor.stealthDisadvantage === true})),
	}));
	for (const effect of effectsOf("savingThrowAdvantage")) {
		const ability = model.abilities.find(candidate => candidate.id === effect.ability);
		if (!ability) throw new TypeError(`Unknown saving throw ability: ${effect.ability}.`);
		ability.savingThrowAdvantages.push({condition: effect.condition || null, feature: effect.feature});
	}
	const skillIndex = new Map(model.abilities.flatMap(ability => ability.skills).map(skill => [skill.id, skill]));
	model.passives = Object.fromEntries(["perception", "insight", "investigation"].map(id => [id, 10 + skillIndex.get(id).modifier]));
	model.languages = languages.map(id => rules.standardLanguages[id]);
	model.training = [...classRule.training, backgroundTool];
	model.gear = [...equipment.gear];
	model.gold = Math.round((classRule.gold + background.gold - equipment.cost) * 100) / 100;
	model.gear.push(`Unspent starting gold: ${model.gold} GP`);
	const armor = equipment.armor;
	const armorValue = armor.base + (armor.dexterity ? mods.dex : 0) + armor.shield + effectsOf("armorBonus").reduce((sum, effect) => sum + effect.amount, 0);
	const overrides = effectsOf("armorOverride");
	if (overrides.length > 1) throw new TypeError("Multiple armor overrides are not supported.");
	const override = overrides[0];
	if (override) {
		const abilityModifier = mods[override.ability];
		if (abilityModifier === undefined) throw new TypeError(`Unknown armor ability: ${override.ability}.`);
		const fallback = override.fallbackBase + abilityModifier;
		model.armorClass = {value: override.base + abilityModifier, condition: `${override.name} active; no armor worn`, fallback, detail: `Unarmored ${fallback}; ${armor.name} ${armorValue} when worn instead.`};
	} else {
		const sources = [armor.name, ...(armor.shield ? ["Shield"] : []), ...effectsOf("armorBonus").map(effect => effect.source.name)];
		model.armorClass = {value: armorValue, condition: sources.join(" + "), fallback: null, detail: null};
	}
	if (armor.strength && scores.str < armor.strength) {
		model.speed = Math.max(0, model.speed - 10);
		model.defenses.push({type: "speed-penalty", amount: 10, armor: armor.name, minimumStrength: armor.strength});
	}
	model.initiative = {value: mods.dex, advantage: effectsOf("initiativeAdvantage").length > 0};
	model.hp = {maximum: Math.max(1, classHitDie + mods.con) + (build.level - 1) * Math.max(1, classHitDie / 2 + 1 + mods.con), current: session.hp.current, temporary: session.hp.temporary};
	if (session.hp.current !== null && session.hp.current > model.hp.maximum) issue("current-hit-points", "Current HP exceeds the calculated maximum for this build.");
	model.hitDice = {count: build.level, die: classHitDie, recovery: {long: "all"}};
	model.concentration = {modifier: mods.con + (classSavingThrows.includes("con") ? pb : 0), advantage: effectsOf("savingThrowAdvantage").some(effect => effect.ability === "con" && effect.concentration)};
	function expandReferences (value, seen = new Set()) {
		if (Array.isArray(value)) return value.map(item => expandReferences(item, seen));
		if (!value || typeof value !== "object") return value;
		if (value.type === "refSubclassFeature") {
			const uid = value.subclassFeature;
			if (seen.has(uid)) throw new TypeError(`Circular subclass feature reference: ${uid}.`);
			const [name, className, classSource, subclassShortName, subclassSource, level] = uid.split("|");
			const matches = (classData?.subclassFeature || []).filter(candidate => candidate.name === name
				&& candidate.className === className && candidate.classSource === classSource
				&& candidate.subclassShortName === subclassShortName && candidate.subclassSource === subclassSource
				&& candidate.level === Number(level) && candidate.source === subclassSource);
			if (matches.length !== 1 || !Array.isArray(matches[0].entries)) throw new TypeError(`Missing or ambiguous subclass feature reference: ${uid}.`);
			return {type: "entries", name, entries: expandReferences(matches[0].entries, new Set([...seen, uid]))};
		}
		if (typeof value.type === "string" && value.type.startsWith("ref")) throw new TypeError(`Unsupported original feature reference: ${value.type}.`);
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandReferences(item, seen)]));
	}
	function feature (record, source, type) {
		if (!record || !Array.isArray(record.entries)) throw new TypeError(`Missing original ${source} feature description.`);
		const result = {
			name: record.name,
			source,
			sourceRef: {
				type,
				name: record.name,
				source: record.source,
				page: record.page ?? null,
				...(record.className ? {className: record.className, classSource: record.classSource, level: record.level} : {}),
				...(record.subclassShortName ? {subclassShortName: record.subclassShortName, subclassSource: record.subclassSource} : {}),
			},
			entries: copy(record.entries),
			displayEntries: expandReferences(record.entries),
			...(record.prerequisite ? {prerequisite: copy(record.prerequisite)} : {}),
		};
		model.features.push(result);
		return result;
	}
	function record (records, name, label) {
		const matches = (records || []).filter(candidate => candidate.name === name && candidate.source === "XPHB");
		if (matches.length !== 1) throw new TypeError(`Missing or ambiguous original ${label} description: ${name}.`);
		return matches[0];
	}
	const rawSpecies = record(sources.races.race, build.species.name, "species");
	if (!selectedLineage) throw new TypeError("Missing selected species lineage.");
	model.speciesLineage = {id: selectedLineage.id, name: selectedLineage.name};
	if (!rawClass) throw new TypeError("Missing original class spellcasting metadata.");
	if (featRule.spellGroup && !Array.isArray(featOptions)) throw new TypeError("Missing original Magic Initiate ability options.");
	for (const entry of rawSpecies.entries || []) {
		const result = feature({...entry, source: rawSpecies.source, page: rawSpecies.page}, "Species", "race");
		if (entry.name === catalogSpecies?.lineageLabel) {
			result.selection = {label: catalogSpecies.lineageChoiceId.endsWith(":lineage") ? "Selected lineage" : "Selected legacy", value: selectedLineage.name};
		}
	}
	for (const entry of classData.classFeature) {
		if (entry.source !== "XPHB" || entry.level > build.level || entry.name === "Eldritch Invocation Options") continue;
		feature(entry, classRule.name, "classFeature");
	}
	if (model.subclassName) {
		const selectedFeatures = classData.subclassFeature.filter(entry => entry.source === "XPHB" && entry.level <= build.level && entry.subclassShortName === model.subclassName);
		const referenced = new Set();
		function collectReferences (value) {
			if (Array.isArray(value)) return value.forEach(collectReferences);
			if (!value || typeof value !== "object") return;
			if (value.type === "refSubclassFeature") referenced.add(value.subclassFeature);
			Object.values(value).forEach(collectReferences);
		}
		selectedFeatures.forEach(entry => collectReferences(entry.entries));
		for (const entry of selectedFeatures) {
			const uid = [entry.name, entry.className, entry.classSource, entry.subclassShortName, entry.subclassSource, entry.level].join("|");
			if (!referenced.has(uid)) feature(entry, model.subclassName, "subclassFeature");
		}
	}
	feature(record(sources.feats.feat, featRule.record.name, "feat"), "Origin Feat", "feat");
	if (build.level >= 4) feature(record(sources.feats.feat, "Ability Score Improvement", "feat"), "Feat", "feat");
	function resource (definition) {
		model.resources.push({...definition, spent: session.resources.find(candidate => candidate.id === definition.id)?.spent || 0});
	}
	function casting (id, label, ability) {
		const value = {id, label, ability, modifier: mods[ability], attack: pb + mods[ability], dc: 8 + pb + mods[ability]};
		model.spellcasting.push(value);
		return value;
	}
	const speciesCasting = casting(species.speciesId, "Species", species.spellcastingAbility);
	const classCasting = rawClass.spellcastingAbility ? casting(classOwner, classRule.name, rawClass.spellcastingAbility) : null;
	const initiateCasting = initiateAbility ? casting(featOwner, featRule.record.name, initiateAbility) : null;
	const collected = new Map();
	function addSpell (id, spellSource) {
		const metadata = spellIndex.get(id);
		if (!metadata) {
			issue(id, "Spell metadata is unavailable for this source.");
			return;
		}
		if (!collected.has(id)) collected.set(id, {id, ref: metadata.ref ? {...metadata.ref} : {name: metadata.name, source: metadata.source}, level: metadata.level, metadata: copy(metadata), sources: []});
		collected.get(id).sources.push({freeLevel: null, slotLevel: null, resourceId: null, atWill: metadata.level === 0, prepared: false, alwaysPrepared: false, canCastWithSlots: false, ...spellSource});
	}
	for (const grant of species.spells) {
		addSpell(grant.id, {...speciesCasting, kind: "species", label: "Species", alwaysPrepared: grant.alwaysPrepared, canCastWithSlots: grant.canCastWithSlots, resourceId: grant.resourceId, freeLevel: grant.resourceId ? grant.level : null, slotLevel: classCasting && grant.canCastWithSlots && grant.level <= levelRule.slotLevel ? levelRule.slotLevel : null});
	}
	for (const grant of species.resources) {
		const spell = spellIndex.get(grant.spellId);
		resource({id: grant.id, name: spell.ref?.name || spell.name, maxUses: grant.maxUses, recovery: {long: "all"}, spellId: grant.spellId, freeLevel: spell.level, spellcastingAbility: species.spellcastingAbility});
	}
	for (const resistance of species.resistances) model.defenses.push({type: "resistance", damageType: resistance});
	for (const effect of effectsOf("resource")) resource({...effect.value, provenance: effect.source, annotationId: effect.annotationId});
	for (const effect of effectsOf("vision")) model.defenses.push({...effect.value, provenance: effect.source, annotationId: effect.annotationId});
	for (const effect of effectsOf("swimSpeed")) model.defenses.push({type: "swim", name: effect.value.name, feet: model.speed, breatheUnderwater: effect.value.breatheUnderwater, provenance: effect.source, annotationId: effect.annotationId});
	for (const effect of effectsOf("truesight")) model.defenses.push({type: "truesight", range: effect.range, provenance: effect.source, annotationId: effect.annotationId});
	if (classRule.name === "Fighter") {
		feature(record(sources.feats.feat, "Defense", "fighting style"), "Fighting Style", "feat");
		for (const mastery of [...new Set(masteries.map(id => rules.weapons[id].mastery))]) {
			feature(record(sources.itemMasteries.itemMastery, mastery, "weapon mastery"), "Mastery", "itemMastery");
		}
	} else if (classRule.name === "Warlock") {
		for (const id of invocations) feature(record(sources.optionalFeatures.optionalfeature, rules.invocations[id].name, "invocation"), "Invocation", "optionalfeature");
		for (const id of [...cantrips, ...prepared]) addSpell(id, {...classCasting, kind: "class", label: classRule.name, prepared: prepared.includes(id), canCastWithSlots: prepared.includes(id), slotLevel: prepared.includes(id) ? levelRule.slotLevel : null});
		for (const grant of classRule.subclassSpells.filter(value => value.minimumLevel <= build.level)) {
			for (const id of grant.spells) addSpell(id, {...classCasting, id: `${classOwner}:${classRule.subclass.id.split("|")[0]}`, kind: "subclass", label: classRule.subclass.name, alwaysPrepared: true, canCastWithSlots: true, slotLevel: levelRule.slotLevel});
		}
	}
	for (const effect of effectsOf("spellGrant")) {
		const caster = model.spellcasting.find(candidate => candidate.id === effect.casterId);
		if (!caster) throw new TypeError(`Spell-grant mechanic requires a known casting source: ${effect.casterId}.`);
		if (effect.value.resourceId && !model.resources.some(resource => resource.id === effect.value.resourceId)) throw new TypeError(`Spell-grant mechanic requires a known resource: ${effect.value.resourceId}.`);
		addSpell(effect.spellId, {...caster, ...effect.value, provenance: effect.source, annotationId: effect.annotationId});
	}
	if (initiateCasting) {
		for (const id of initiateCantrips) addSpell(id, {...initiateCasting, kind: "feat", label: "Magic Initiate"});
		const resourceId = `${featOwner}:healing-word`;
		addSpell(initiateSpell, {...initiateCasting, kind: "feat", label: "Magic Initiate", resourceId, alwaysPrepared: true, canCastWithSlots: true, freeLevel: 1, slotLevel: classCasting ? levelRule.slotLevel : null});
	}
	model.spells = [...collected.values()].sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name));
	const weaponAbility = weapon => weapon.finesse ? (mods.dex >= mods.str ? "dex" : "str") : "str";
	for (const id of equipment.weapons) {
		const weapon = rules.weapons[id];
		const ability = weaponAbility(weapon);
		model.attacks.push({name: weapon.name, action: "Attack", range: weapon.range, toHit: pb + mods[ability], damage: `${weapon.damage}${mods[ability] ? signed(mods[ability]) : ""} ${weapon.type}`, count: levelRule.attacks || 1, unit: "attacks", mastery: masteries.includes(id) ? weapon.mastery : null, criticalRange: effectsOf("criticalRange").length ? {min: effectsOf("criticalRange")[0].min, max: effectsOf("criticalRange")[0].max} : null});
	}
	for (const bonus of effectsOf("spellDamageBonus")) {
		if (!effectsOf("spellAttack").some(attack => attack.spellId === bonus.spellId && attack.casterId === bonus.casterId)) throw new TypeError(`Spell-damage mechanic has no matching attack: ${bonus.spellId} / ${bonus.casterId}.`);
	}
	for (const effect of effectsOf("spellAttack")) {
		const caster = model.spellcasting.find(candidate => candidate.id === effect.casterId);
		if (!caster) throw new TypeError(`Spell-attack mechanic requires a known casting source: ${effect.casterId}.`);
		const progression = effect.value.counts.filter(step => step.minimumLevel <= build.level).sort((a, b) => b.minimumLevel - a.minimumLevel)[0];
		if (!progression) throw new TypeError(`Spell attack has no applicable progression: ${effect.spellId}.`);
		const bonus = effectsOf("spellDamageBonus").filter(candidate => candidate.spellId === effect.spellId && candidate.casterId === effect.casterId).reduce((total, candidate) => total + candidate.amount, 0);
		const {name, action, range, dice, damageType, unit} = effect.value;
		model.attacks.unshift({name, action, range, toHit: caster.attack, count: progression.value, unit, damage: `${dice}${bonus ? signed(bonus) : ""} ${damageType}`, provenance: effect.source, annotationId: effect.annotationId});
	}
	if (pactWeapon) {
		model.attacks.unshift({name: pactWeapon.name, action: "Attack", range: pactWeapon.range, toHit: pb + mods.cha, damage: `${pactWeapon.damage}${mods.cha ? signed(mods.cha) : ""} ${pactWeapon.type}`, count: 1 + pactExtraAttacks, unit: "attacks", mastery: null, criticalRange: effectsOf("criticalRange").length ? {min: effectsOf("criticalRange")[0].min, max: effectsOf("criticalRange")[0].max} : null});
	}
	for (const state of session.resources) {
		const definition = model.resources.find(value => value.id === state.id);
		if (!definition) issue(state.id, "Session resource does not belong to this build.");
		else if (state.spent > definition.maxUses) issue(state.id, "Spent resource uses exceed this build's maximum.");
	}
	model.status = model.issues.length ? "incomplete" : "complete";
	return model;
}
