import {validateCharacterDocument} from "./character-document.js";
import {projectSpecies} from "./species-projection.js";

const ABILITIES = [
	["str", "Strength", [["athletics", "Athletics"]]],
	["dex", "Dexterity", [["acrobatics", "Acrobatics"], ["sleight-of-hand", "Sleight of Hand"], ["stealth", "Stealth"]]],
	["con", "Constitution", []],
	["int", "Intelligence", [["arcana", "Arcana"], ["history", "History"], ["investigation", "Investigation"], ["nature", "Nature"], ["religion", "Religion"]]],
	["wis", "Wisdom", [["animal-handling", "Animal Handling"], ["insight", "Insight"], ["medicine", "Medicine"], ["perception", "Perception"], ["survival", "Survival"]]],
	["cha", "Charisma", [["deception", "Deception"], ["intimidation", "Intimidation"], ["performance", "Performance"], ["persuasion", "Persuasion"]]],
];
const ABILITY_IDS = ABILITIES.map(([id]) => id);
const copy = value => JSON.parse(JSON.stringify(value));
const key = ref => `${ref.name.toLowerCase().replaceAll(" ", "-")}|${ref.source.toLowerCase()}`;
const modifier = score => Math.floor((score - 10) / 2);
const signed = value => `${value >= 0 ? "+" : ""}${value}`;

function checkRules (rules, document) {
	if (rules.schemaVersion !== 1 || rules.ruleset !== document.ruleset) throw new TypeError("sheetRules: unsupported version or ruleset");
	if (["id", "version", "revision"].some(field => rules.dataset?.[field] !== document.dataset[field])) throw new TypeError("sheetRules.dataset: does not match the character's pinned dataset");
	for (const field of ["classes", "backgrounds", "weapons", "equipment", "invocations", "standardLanguages"]) {
		if (!rules[field] || typeof rules[field] !== "object" || Array.isArray(rules[field])) throw new TypeError(`sheetRules.${field}: missing reviewed records`);
	}
	for (const record of Object.values(rules.classes)) {
		if (!Array.isArray(record.levels) || record.levels.length !== 5 || ![8, 10].includes(record.hitDie)) throw new TypeError("sheetRules.classes: unsupported class progression");
	}
}

/**
 * Calculate the deliberately limited, reviewed level 1–5 sheet subset.
 * Build decisions live in the v1 document; numerical results never depend on
 * an example ID or name. Unsupported decisions produce an incomplete draft.
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
	if (!classRule) issue("class", "This class and source are outside the reviewed sheet subset.");
	if (!background) issue("background", "Choose a supported background: Soldier or Acolyte (2024).");
	if (!classRule || !background) return model;
	model.className = classRule.name;
	const levelRule = classRule.levels[build.level - 1];
	const classOwner = `class:${classId}`;
	const backgroundOwner = `background:${backgroundId}`;
	const decisions = new Map(build.choices.map(choice => [choice.id, choice.selected]));
	const consumed = new Set(build.choices.filter(choice => choice.id.startsWith(`${species.speciesId}:`)).map(choice => choice.id));
	function select (id, options, count, label) {
		consumed.add(id);
		const selected = decisions.get(id) || [];
		if (selected.length !== count || selected.some(value => !options.includes(value))) issue(id, `${label}: choose ${count} supported ${count === 1 ? "option" : "options"}.`);
		return selected.filter(value => options.includes(value));
	}
	function increases (id, allowed, scores, isBackground) {
		consumed.add(id);
		const selected = decisions.get(id) || [];
		const parts = selected.length === 1 ? selected[0].split(".").map(value => /^([a-z]{3})-([12])$/.exec(value)) : [];
		const values = parts.filter(Boolean).map(match => ({ability: match[1], amount: Number(match[2])}));
		const total = values.reduce((sum, value) => sum + value.amount, 0);
		if (!parts.length || values.length !== parts.length || new Set(values.map(value => value.ability)).size !== values.length
			|| values.some(value => !allowed.includes(value.ability)) || total !== (isBackground ? 3 : 2)
			|| (isBackground && values.length !== 2 && values.length !== 3)) {
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
	increases(`${backgroundOwner}:ability-increases`, background.abilities, scores, true);
	const classSkills = select(`${classOwner}:skills`, classRule.skillOptions, 2, "Class skills");
	if (classSkills.some(skill => background.skills.includes(skill))) issue(`${classOwner}:skills`, "Choose class skills distinct from the background proficiencies; replacement choices are outside this subset.");
	const skillProficiencies = new Set([...background.skills, ...classSkills]);
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
	const [equipmentId] = select(`${classOwner}:equipment`, Object.entries(rules.equipment).filter(([, value]) => value.classId === classId && value.backgroundId === backgroundId).map(([id]) => id), 1, "Equipment purchase");
	const equipment = rules.equipment[equipmentId];
	if (equipment && equipment.cost > classRule.gold + background.gold) issue(`${classOwner}:equipment`, "The selected equipment exceeds the starting gold budget.");
	let masteries = [];
	let invocations = [];
	let cantrips = [];
	let prepared = [];
	const invocationCantrips = new Map();
	let initiateAbility;
	let initiateCantrips = [];
	let initiateSpell;
	if (background.feat === "Magic Initiate (Cleric)") {
		[initiateAbility] = select("feat:magic-initiate-cleric|xphb:ability", ["int", "wis", "cha"], 1, "Magic Initiate ability");
		initiateCantrips = select("feat:magic-initiate-cleric|xphb:cantrips", ["spell:guidance|xphb", "spell:light|xphb"], 2, "Magic Initiate cantrips");
		[initiateSpell] = select("feat:magic-initiate-cleric|xphb:spell", ["spell:healing-word|xphb"], 1, "Magic Initiate level 1 spell");
	}
	if (classRule.name === "Fighter") {
		select(`${classOwner}:fighting-style`, ["defense|xphb"], 1, "Fighting Style");
		masteries = select(`${classOwner}:weapon-masteries`, Object.keys(rules.weapons).filter(id => id !== "dagger|xphb"), levelRule.masteries, "Weapon Mastery");
	} else {
		cantrips = select(`${classOwner}:cantrips`, classRule.cantripOptions, levelRule.cantrips, "Warlock cantrips");
		prepared = select(`${classOwner}:prepared-spells`, classRule.preparedOptions, levelRule.prepared, "Prepared Warlock spells");
		invocations = select(`${classOwner}:invocations`, Object.entries(rules.invocations).filter(([, value]) => value.minimumLevel <= build.level).map(([id]) => id), levelRule.invocations, "Eldritch Invocations");
		for (const id of invocations) {
			const invocation = rules.invocations[id];
			if (!invocation.cantripChoice) continue;
			const [cantrip] = select(`${classOwner}:${invocation.cantripChoice}`, invocation.cantripOptions, 1, invocation.name);
			if (cantrip && !cantrips.includes(cantrip)) issue(`${classOwner}:${invocation.cantripChoice}`, "The invocation must affect a known Warlock cantrip.");
			invocationCantrips.set(id, cantrip);
		}
	}
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
	for (const id of [...cantrips, ...prepared, ...initiateCantrips, ...(initiateSpell ? [initiateSpell] : [])]) {
		const spell = spellIndex.get(id);
		if (!spell) issue(id, "Spell metadata is unavailable for this source.");
		else if (cantrips.includes(id) && spell.level !== 0) issue(id, "A selected cantrip is not level 0.");
		else if (prepared.includes(id) && (spell.level < 1 || spell.level > levelRule.slotLevel)) issue(id, "A prepared spell exceeds the available Pact Magic slot level.");
	}
	if (model.issues.length) return model;

	const mods = Object.fromEntries(ABILITY_IDS.map(id => [id, modifier(scores[id])]));
	const pb = species.proficiencyBonus;
	const isChampion = model.subclassName === "Champion";
	const hasInvocation = id => invocations.includes(`${id}|xphb`);
	model.abilities = ABILITIES.map(([id, name, skills]) => ({
		id,
		name,
		score: scores[id],
		modifier: mods[id],
		save: mods[id] + (classRule.saveProficiencies.includes(id) ? pb : 0),
		saveProficient: classRule.saveProficiencies.includes(id),
		savingThrowAdvantages: species.savingThrowAdvantages.filter(advantage => advantage.ability === id).map(advantage => ({...advantage})),
		skills: skills.map(([skillId, skillName]) => ({id: skillId, name: skillName, modifier: mods[id] + (skillProficiencies.has(skillId) ? pb : 0), proficient: skillProficiencies.has(skillId), advantage: isChampion && skillId === "athletics", disadvantage: skillId === "stealth" && equipment.armor.stealthDisadvantage === true})),
	}));
	if (hasInvocation("eldritch-mind")) model.abilities.find(ability => ability.id === "con").savingThrowAdvantages.push({condition: "to maintain Concentration", feature: "Eldritch Mind"});
	const skillIndex = new Map(model.abilities.flatMap(ability => ability.skills).map(skill => [skill.id, skill]));
	model.passives = Object.fromEntries(["perception", "insight", "investigation"].map(id => [id, 10 + skillIndex.get(id).modifier]));
	model.languages = languages.map(id => rules.standardLanguages[id]);
	model.training = [...classRule.training, backgroundTool];
	model.gear = [...equipment.gear];
	model.gold = Math.round((classRule.gold + background.gold - equipment.cost) * 100) / 100;
	model.gear.push(`Unspent starting gold: ${model.gold} GP`);
	const armor = equipment.armor;
	const armorValue = armor.base + (armor.dexterity ? mods.dex : 0) + armor.shield + (classRule.name === "Fighter" ? 1 : 0);
	model.armorClass = hasInvocation("armor-of-shadows")
		? {value: 13 + mods.dex, condition: "Mage Armor active; no armor worn", fallback: 10 + mods.dex, detail: `Unarmored ${10 + mods.dex}; Leather Armor ${armorValue} when worn instead.`}
		: {value: armorValue, condition: classRule.name === "Fighter" ? "Chain Mail + Shield + Defense" : "Leather Armor", fallback: null, detail: null};
	if (armor.strength && scores.str < armor.strength) {
		model.speed = Math.max(0, model.speed - 10);
		model.defenses.push(`Speed reduced by 10 feet: ${armor.name} requires Strength ${armor.strength}.`);
	}
	model.initiative = {value: mods.dex, advantage: isChampion};
	model.hp = {maximum: Math.max(1, classRule.hitDie + mods.con) + (build.level - 1) * Math.max(1, classRule.hitDie / 2 + 1 + mods.con), current: session.hp.current, temporary: session.hp.temporary};
	if (session.hp.current !== null && session.hp.current > model.hp.maximum) issue("current-hit-points", "Current HP exceeds the calculated maximum for this build.");
	model.hitDice = {count: build.level, die: classRule.hitDie, recovery: "Regain all spent Hit Dice after a Long Rest."};
	model.concentration = {modifier: mods.con + (classRule.saveProficiencies.includes("con") ? pb : 0), advantage: hasInvocation("eldritch-mind")};
	const classData = classRule.name === "Fighter" ? sources?.fighter : sources?.warlock;
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
	if (!sources?.races?.race || !sources?.fighter?.classFeature || !sources?.fighter?.subclassFeature
		|| !sources?.warlock?.classFeature || !sources?.warlock?.subclassFeature
		|| !sources?.optionalFeatures?.optionalfeature || !sources?.feats?.feat || !sources?.itemMasteries?.itemMastery) {
		issue("source-descriptions", "Original feature descriptions are unavailable. Reload the source data.");
		return model;
	}
	const rawSpecies = record(sources.races.race, build.species.name, "species");
	const catalogSpecies = catalog.species.find(candidate => candidate.id === species.speciesId);
	const lineageId = decisions.get(catalogSpecies.lineageChoiceId)?.[0];
	const selectedLineage = catalogSpecies.lineages.find(candidate => candidate.id === lineageId);
	if (!selectedLineage) throw new TypeError("Missing selected species lineage.");
	model.speciesLineage = {id: selectedLineage.id, name: selectedLineage.name};
	for (const entry of rawSpecies.entries || []) {
		const result = feature({...entry, source: rawSpecies.source, page: rawSpecies.page}, "Species", "race");
		if (["Gnomish Lineage", "Fiendish Legacy"].includes(entry.name)) {
			result.selection = {label: entry.name === "Gnomish Lineage" ? "Selected lineage" : "Selected legacy", value: selectedLineage.name};
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
	feature(record(sources.feats.feat, background.feat === "Magic Initiate (Cleric)" ? "Magic Initiate" : background.feat, "feat"), "Origin Feat", "feat");
	if (build.level >= 4) feature(record(sources.feats.feat, "Ability Score Improvement", "feat"), "Feat", "feat");
	function resource (id, name, maxUses, reset, recovery, detail, extra = {}) {
		model.resources.push({id, name, maxUses, reset, recovery, detail, spent: session.resources.find(candidate => candidate.id === id)?.spent || 0, ...extra});
	}
	function casting (id, label, ability) {
		const value = {id, label, ability, modifier: mods[ability], attack: pb + mods[ability], dc: 8 + pb + mods[ability]};
		model.spellcasting.push(value);
		return value;
	}
	const speciesCasting = casting(species.speciesId, "Species", species.spellcastingAbility);
	const classCasting = classRule.name === "Warlock" ? casting(classOwner, "Warlock", "cha") : null;
	const initiateCasting = initiateAbility ? casting("feat:magic-initiate-cleric|xphb", "Magic Initiate", initiateAbility) : null;
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
		resource(grant.id, spell.ref?.name || spell.name, grant.maxUses, "long", "Regain all uses after a Long Rest.", `Free spell at level ${spell.level}; species ${species.spellcastingAbility.toUpperCase()}.`, {spellId: grant.spellId, freeLevel: spell.level});
	}
	for (const resistance of species.resistances) model.defenses.push(`Resistance to ${resistance} damage.`);
	if (classRule.name === "Fighter") {
		resource(`${classOwner}:second-wind`, "Second Wind", levelRule.secondWind, "partial-short", "Short Rest: regain 1 spent use. Long Rest: regain all uses.", `Bonus Action: regain 1d10 + ${build.level} HP.`);
		feature(record(sources.feats.feat, "Defense", "fighting style"), "Fighting Style", "feat");
		for (const mastery of [...new Set(masteries.map(id => rules.weapons[id].mastery))]) {
			feature(record(sources.itemMasteries.itemMastery, mastery, "weapon mastery"), "Mastery", "itemMastery");
		}
		if (build.level >= 2) {
			resource(`${classOwner}:action-surge`, "Action Surge", 1, "short", "Regain after a Short or Long Rest.", "");
		}
	} else {
		resource(`${classOwner}:pact-magic`, "Pact Magic", levelRule.slots, "short", "Regain all slots after a Short or Long Rest.", `${levelRule.slots} spell ${levelRule.slots === 1 ? "slot" : "slots"} at level ${levelRule.slotLevel}; all Pact slots have this level.`, {slotLevel: levelRule.slotLevel});
		if (build.level >= 2) resource(`${classOwner}:magical-cunning`, "Magical Cunning", 1, "long", "Regain after a Long Rest.", "");
		for (const id of invocations) feature(record(sources.optionalFeatures.optionalfeature, rules.invocations[id].name, "invocation"), "Invocation", "optionalfeature");
		if (hasInvocation("devils-sight")) model.defenses.push("Devil's Sight: see normally within 120 ft in magical and nonmagical Dim Light and Darkness; separate from Darkvision.");
		for (const id of [...cantrips, ...prepared]) addSpell(id, {...classCasting, kind: "class", label: "Warlock", prepared: prepared.includes(id), canCastWithSlots: prepared.includes(id), slotLevel: prepared.includes(id) ? levelRule.slotLevel : null});
		for (const grant of classRule.subclassSpells.filter(value => value.minimumLevel <= build.level)) {
			for (const id of grant.spells) addSpell(id, {...classCasting, id: `${classOwner}:fiend`, kind: "subclass", label: "Fiend", alwaysPrepared: true, canCastWithSlots: true, slotLevel: levelRule.slotLevel});
		}
		if (hasInvocation("armor-of-shadows")) addSpell("spell:mage-armor|xphb", {...classCasting, id: `${classOwner}:armor-of-shadows`, kind: "invocation", label: "Armor of Shadows", atWill: true, freeLevel: 1, restriction: "Self only; normal spell components required."});
	}
	if (initiateCasting) {
		for (const id of initiateCantrips) addSpell(id, {...initiateCasting, kind: "feat", label: "Magic Initiate"});
		const resourceId = "feat:magic-initiate-cleric|xphb:healing-word";
		resource(resourceId, "Healing Word", 1, "long", "Regain the free casting after a Long Rest.", `Magic Initiate: free level 1 casting heals 2d4 ${signed(mods[initiateAbility])} HP.`, {spellId: initiateSpell, freeLevel: 1});
		addSpell(initiateSpell, {...initiateCasting, kind: "feat", label: "Magic Initiate", resourceId, alwaysPrepared: true, canCastWithSlots: true, freeLevel: 1, slotLevel: classCasting ? levelRule.slotLevel : null});
	}
	model.spells = [...collected.values()].sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name));
	const weaponAbility = weapon => weapon.finesse ? (mods.dex >= mods.str ? "dex" : "str") : "str";
	for (const id of equipment.weapons) {
		const weapon = rules.weapons[id];
		const ability = weaponAbility(weapon);
		const notes = [masteries.includes(id) ? `${weapon.mastery} mastery` : "", isChampion ? "Critical Hit 19–20" : "", classRule.name === "Fighter" && levelRule.attacks === 2 ? "2 attacks per Attack action" : ""].filter(Boolean).join("; ");
		model.attacks.push({name: weapon.name, action: "Attack", range: weapon.range, toHit: pb + mods[ability], damage: `${weapon.damage}${mods[ability] ? signed(mods[ability]) : ""} ${weapon.type}`, count: levelRule.attacks || 1, unit: "attacks", notes});
	}
	if (cantrips.includes("spell:eldritch-blast|xphb")) {
		const agonizing = invocationCantrips.get("agonizing-blast|xphb") === "spell:eldritch-blast|xphb";
		const attack = {name: "Eldritch Blast", action: "Magic", range: "120 ft", toHit: classCasting.attack, count: build.level >= 5 ? 2 : 1, unit: "beams", damage: `1d10${agonizing && mods.cha ? signed(mods.cha) : ""} force`, notes: ""};
		model.attacks.unshift(attack);
	}
	for (const state of session.resources) {
		const definition = model.resources.find(value => value.id === state.id);
		if (!definition) issue(state.id, "Session resource does not belong to this build.");
		else if (state.spent > definition.maxUses) issue(state.id, "Spent resource uses exceed this build's maximum.");
	}
	model.status = model.issues.length ? "incomplete" : "complete";
	return model;
}
