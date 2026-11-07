# Species reference results

These cases verify species contributions before the full character sheet is implemented. They use the Gnome/Fighter and Tiefling/Warlock draft documents from PR #1; backgrounds, class choices, equipment, and final ability scores remain unfinished. Passing these checks does not establish that a complete D&D build is legal.

Expected values are recorded independently in `test/fixtures/character-builder/species-reference-cases.json`, based on the [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), the Proficiency Bonus table, Gnome on page 85, and Tiefling on page 86. Tests compare the projection of actual 5etools data and the reviewed annotations against those values.

| Draft | Character level | PB | Species cantrips | Separate free spell resources |
| --- | --- | --- | --- | --- |
| Forest Gnome / Fighter | 1 | +2 | Minor Illusion | Speak with Animals: 2 / Long Rest |
| Forest Gnome / Fighter | 3 | +2 | Minor Illusion | Speak with Animals: 2 / Long Rest |
| Forest Gnome / Fighter | 5 | +3 | Minor Illusion | Speak with Animals: 3 / Long Rest |
| Infernal Tiefling / Warlock | 1 | +2 | Fire Bolt, Thaumaturgy | None |
| Infernal Tiefling / Warlock | 3 | +2 | Fire Bolt, Thaumaturgy | Hellish Rebuke: 1 / Long Rest |
| Infernal Tiefling / Warlock | 5 | +3 | Fire Bolt, Thaumaturgy | Hellish Rebuke: 1 / Long Rest; Darkness: 1 / Long Rest |

Both species have Speed 30 feet and Darkvision 60 feet. The Gnome is Small; the reference Tiefling selects Medium. Gnomish Cunning contributes unconditional advantage on Intelligence, Wisdom, and Charisma saves. Infernal legacy contributes Fire resistance.

All six cases select Intelligence for species magic. The Warlock's class spellcasting ability does not replace that choice. No numeric species spell DC or spell attack is calculated from the document's base ability scores: final scores will be supplied by later character calculations.

Leveled spells granted by these species are always prepared and also permit casting with suitable spell slots. Free casting uses the spell's normal level: Hellish Rebuke is level 1 in the 2024 species. Cantrips do not receive expendable-use resources. Speak with Animals retains its ritual metadata so that the future sheet can display ritual casting as an additional method.

The broader catalog/projection tests cover Rock Gnome and the Abyssal and Chthonic Tiefling legacies, incomplete selections, unsupported references, input immutability, and changes of lineage. Class resources such as Pact Magic are outside this species-only projection and are left in the saved session unchanged.
