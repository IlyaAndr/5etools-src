#!/usr/bin/env python3
"""Check complete reference sheets, compact drafts, and A4 review PDFs."""

import argparse
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shutil
import subprocess
from threading import Thread


ROOT = Path(__file__).resolve().parents[2]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@contextmanager
def preview_server():
    server = ThreadingHTTPServer(
        ('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT))
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/characterbuilder.html'
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def check_width(page):
    assert not page.evaluate(
        'document.documentElement.scrollWidth > window.innerWidth + 1'
    ), 'The preview overflows the viewport horizontally.'


def export_pdf(page, target, expected_pages=None):
    page.emulate_media(media='print')
    assert not page.locator('#print-sheet').is_visible(), 'Print controls appear on paper.'
    assert not page.locator('#navigation').is_visible(), 'Site navigation appears on paper.'
    assert page.locator('.cb-page-head').first.is_visible(), 'Character sheet headings are hidden on paper.'
    assert page.locator('.cb-spell-head').first.is_visible(), 'Spell headings are hidden on paper.'
    bounds = page.locator('.cb-page').evaluate_all('''pages => pages.map(page => ({
        width: page.getBoundingClientRect().width,
        overflow: page.scrollWidth > page.clientWidth + 1
    }))''')
    assert bounds and all(abs(item['width'] - 725.7) < 2 for item in bounds), bounds
    assert not any(item['overflow'] for item in bounds), bounds
    page.pdf(path=str(target), prefer_css_page_size=True, print_background=True)
    info = subprocess.check_output(['pdfinfo', str(target)], text=True)
    match = re.search(r'^Pages:\s+(\d+)', info, re.MULTILINE)
    assert match, f'Cannot determine PDF page count: {target}'
    pages = int(match.group(1))
    size = re.search(r'Page size:\s+([\d.]+) x ([\d.]+) pts', info)
    assert size and abs(float(size.group(1)) - 595.28) < 2 and abs(float(size.group(2)) - 841.89) < 2, info
    if expected_pages is not None:
        assert pages == expected_pages, f'{target.name}: {pages} pages, expected {expected_pages}'
    page.emulate_media(media='screen')
    return pages


def upload(page, document, filename='character.json'):
    page.locator('#character-import').set_input_files({
        'name': filename,
        'mimeType': 'application/json',
        'buffer': json.dumps(document).encode('utf-8'),
    })


def group_text(page, editor, label):
    return editor.locator('fieldset').filter(
        has=page.locator(f'legend:text-is("{label}")')).first.inner_text()


def final_score(editor, label):
    return editor.locator('.cb-editor__final-score').filter(has_text=label).first.inner_text()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'scratch/character-builder-preview')
    parser.add_argument('--browser', default=shutil.which('google-chrome') or shutil.which('chromium'))
    args = parser.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit('Python Playwright is unavailable; use an existing browser for manual checks.')
    for command in ['pdfinfo', 'pdftotext']:
        if not shutil.which(command):
            raise SystemExit(f'{command} is required for PDF validation.')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    layout_errors = []
    results = []
    with preview_server() as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=args.browser,
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
        )
        try:
            page = browser.new_page(viewport={'width': 1100, 'height': 1300})
            page.on('pageerror', lambda error: errors.append(str(error)))
            # The shared Player menu opens the builder and links back on mobile.
            page.goto(url.replace('characterbuilder.html', 'statgen.html'), wait_until='domcontentloaded')
            builder_link = page.locator('#navbar li[data-page="characterbuilder.html"]')
            builder_link.wait_for(state='attached')
            assert builder_link.evaluate("element => element.previousElementSibling.dataset.page") == 'statgen.html'
            player = page.locator('#navbar > li.dropdown').filter(has=page.locator('li[data-page="characterbuilder.html"]'))
            assert player.locator(':scope > a').inner_text().strip() == 'Player'
            player.locator(':scope > a').click()
            builder_link.locator('a').click()
            page.wait_for_url('**/characterbuilder.html')
            page.wait_for_selector('.cb-character-sheet')
            assert 've-active' in page.locator('#navbar li[data-page="characterbuilder.html"]').get_attribute('class')
            assert 've-active' in page.locator('#navbar > li.dropdown').filter(has=page.locator('li[data-page="characterbuilder.html"]')).get_attribute('class')
            page.set_viewport_size({'width': 390, 'height': 844})
            page.locator('#navigation button.page__btn-toggle-nav').click()
            player = page.locator('#navbar > li.dropdown').filter(has=page.locator('li[data-page="statgen.html"]'))
            player.locator(':scope > a').click()
            page.locator('#navbar li[data-page="statgen.html"] a').click()
            page.wait_for_url('**/statgen.html')
            page.set_viewport_size({'width': 1100, 'height': 1300})
            page.goto(url, wait_until='networkidle')
            page.wait_for_selector('.cb-character-sheet')
            assert page.locator('#print-sheet').is_enabled()
            options = page.locator('#example-select option').evaluate_all(
                'options => options.filter(option => option.value).map(option => ({value:option.value,label:option.textContent}))'
            )
            assert len(options) == 6, options
            for option in options:
                page.select_option('#example-select', option['value'])
                page.wait_for_selector('.cb-spell-reference')
                sheet = page.locator('.cb-character-sheet')
                assert sheet.get_attribute('data-sheet-status') == 'complete'
                assert sheet.locator('.cb-abilities tbody tr').count() == 6
                assert sheet.locator('.cb-skill').count() == 18
                assert sheet.locator('.cb-attack-panel').count() == 1
                assert sheet.locator('.cb-resource').count() >= 3
                assert 'Class statistics are pending' not in sheet.inner_text()
                assert '{@' not in page.locator('#sheet-preview').inner_text()
                check_width(page)
                page.emulate_media(media='print')
                height = sheet.bounding_box()['height']
                if height > 1055:
                    sheet.screenshot(path=str(output / f'{option["value"]}-overflow.png'))
                    bounds = sheet.evaluate('''element => [...element.children].map(child => ({
                        className:child.className,
                        height:child.getBoundingClientRect().height,
                        text:child.textContent.slice(0,80)
                    }))''')
                    layout_errors.append({'example': option['value'], 'height': height, 'bounds': bounds})
                page.emulate_media(media='screen')
                pdf = output / f'{option["value"]}.pdf'
                pages = export_pdf(page, pdf)
                assert pages >= 3, f'{option["value"]}: missing reference pages ({pages})'
                names = page.locator('.cb-spell h3').all_text_contents()
                pdf_text = re.sub(r'\s+', ' ', subprocess.check_output(['pdftotext', str(pdf), '-'], text=True))
                assert all(name in pdf_text for name in names), 'A spell is missing from the printed reference.'
                features = page.locator('.cb-feature-reference h3').all_text_contents()
                assert all(name in pdf_text for name in features), 'A feature is missing from the printed reference.'
                assert 'Complete source descriptions' in pdf_text
                paragraphs = page.locator('.cb-feature-reference .cb-spell-body p, .cb-spell .cb-spell-body p, .cb-spell-body th, .cb-spell-body td').all_text_contents()
                for paragraph in paragraphs:
                    original = re.sub(r'\s+', ' ', paragraph).strip()
                    if original:
                        assert original in pdf_text, f'Missing description text in {option["value"]}: {original[:100]}'
                if 'tiefling' in option['value'] and not option['value'].endswith('-1'):
                    assert 'The creature that damaged you is momentarily surrounded by green flames.' in pdf_text
                    assert 'The damage increases by 1d10 for each spell slot level above 1.' in pdf_text
                results.append({'example': option['value'], 'pages': pages, 'spells': len(names)})
                if '5' in option['value']:
                    page.locator('.cb-character-sheet').screenshot(path=str(output / f'{option["value"]}-sheet.png'))
                    page.locator('.cb-spell-reference').screenshot(path=str(output / f'{option["value"]}-spells.png'))
                    if shutil.which('pdftoppm'):
                        subprocess.run(['pdftoppm', '-scale-to', '1400', '-png', str(pdf), str(output / f'{option["value"]}-print')], check=True)
                page.set_viewport_size({'width': 390, 'height': 844})
                check_width(page)
                if '5' in option['value']:
                    page.screenshot(path=str(output / f'{option["value"]}-mobile.png'), full_page=True)
                page.set_viewport_size({'width': 1100, 'height': 1300})

            before = page.locator('#sheet-preview').inner_html()
            selected = page.locator('#example-select').input_value()
            page.locator('#character-import').set_input_files({
                'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{'
            })
            page.wait_for_function("document.querySelector('#error-message').textContent.toLowerCase().includes('invalid')")
            assert page.locator('#sheet-preview').inner_html() == before
            assert page.locator('#example-select').input_value() == selected

            document = page.evaluate('''async () => {
                const {createSheetExamples} = await import('/js/character-builder/sheet-examples.js');
                const rules = await (await fetch('/js/character-builder/rules/species.json')).json();
                return createSheetExamples(rules.dataset).find(example => example.id === 'infernal-tiefling-warlock-level-5').document;
            }''')

            # A saved character with different spellcasting abilities keeps both
            # profiles visible and printable without changing its decisions.
            mixed = json.loads(json.dumps(document))
            mixed['name'] = 'Imported mixed spellcasting'
            next(choice for choice in mixed['build']['choices'] if choice['id'] == 'species:tiefling|xphb:spellcasting-ability')['selected'] = ['int']
            upload(page, mixed)
            page.wait_for_function("document.querySelector('.cb-character-sheet h1')?.textContent === 'Imported mixed spellcasting'")
            breakdown = page.locator('[aria-label="Spellcasting by source"]')
            assert breakdown.count() == 1
            assert 'INT' in breakdown.inner_text() and 'CHA' in breakdown.inner_text()
            page.emulate_media(media='print')
            mixed_height = page.locator('.cb-character-sheet').bounding_box()['height']
            assert mixed_height <= 1055, f'Mixed spellcasting sheet exceeds A4: {mixed_height}'
            page.emulate_media(media='screen')
            mixed_pdf = output / 'mixed-spellcasting.pdf'
            export_pdf(page, mixed_pdf)
            mixed_text = re.sub(r'\s+', ' ', subprocess.check_output(['pdftotext', str(mixed_pdf), '-'], text=True))
            assert 'Species: INT · attack +4 · DC 12' in mixed_text
            assert 'Warlock' in mixed_text and 'CHA · attack +7 · DC 15' in mixed_text

            # Unresolved species and feat choices receive the same valid
            # suggestion from the fixed Warlock spellcasting ability.
            choices_pending = json.loads(json.dumps(document))
            choices_pending['name'] = 'Shared spellcasting suggestion'
            for choice in choices_pending['build']['choices']:
                if choice['id'] in ['species:tiefling|xphb:spellcasting-ability', 'feat:magic-initiate-cleric|xphb:ability']:
                    choice['selected'] = []
            upload(page, choices_pending)
            page.wait_for_function("document.querySelector('.cb-character-sheet h1')?.textContent === 'Shared spellcasting suggestion'")
            assert page.locator('.cb-unresolved').inner_text().count('Suggested: CHA') == 2
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'

            # A disabled placeholder must not invalidate an in-flight file read.
            page.evaluate('''() => {
                window.previewOriginalFileText = File.prototype.text;
                File.prototype.text = function () {
                    return new Promise((resolve, reject) => {
                        window.previewResolveFile = resolve;
                        window.previewRejectFile = reject;
                    });
                };
            }''')
            document['name'] = 'Delayed imported character'
            upload(page, document)
            page.wait_for_function("typeof window.previewResolveFile === 'function'")
            page.evaluate('''() => {
                const select = document.querySelector('#example-select');
                select.value = '';
                select.dispatchEvent(new Event('change'));
            }''')
            page.evaluate('text => window.previewResolveFile(text)', json.dumps(document))
            page.wait_for_function("document.querySelector('.cb-character-sheet h1')?.textContent === 'Delayed imported character'")
            assert page.locator('#print-sheet').is_enabled()

            # Selecting a real example cancels both stale successful and failed reads.
            for reject in [False, True]:
                page.evaluate('window.previewResolveFile=null; window.previewRejectFile=null')
                document['name'] = 'Stale imported character'
                upload(page, document)
                page.wait_for_function("typeof window.previewResolveFile === 'function'")
                page.select_option('#example-select', options[0]['value'])
                expected_html = page.locator('#sheet-preview').inner_html()
                page.evaluate('''async ({text, reject}) => {
                    if (reject) window.previewRejectFile(new Error('Stale file failure'));
                    else window.previewResolveFile(text);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }''', {'text': json.dumps(document), 'reject': reject})
                assert page.locator('#sheet-preview').inner_html() == expected_html
                assert page.locator('#print-sheet').is_enabled()
                assert page.locator('#error-message').is_hidden()
            page.evaluate('() => { File.prototype.text=window.previewOriginalFileText; }')

            document['name'] = '<img src=x onerror="window.previewInjected=true">'
            document['session']['notes'] = '<script>window.previewInjected=true</script>'
            upload(page, document)
            page.wait_for_function('''name => document.querySelector('.cb-character-sheet h1')?.textContent === name''', arg=document['name'])
            assert page.locator('#sheet-preview img, #sheet-preview script').count() == 0
            assert page.evaluate('window.previewInjected') is None
            assert document['session']['notes'] in page.locator('.cb-notes').inner_text()

            pending = json.loads(json.dumps(document))
            pending['name'] = 'Pending species choices'
            pending['build']['choices'] = []
            upload(page, pending)
            page.wait_for_function("document.querySelector('.cb-character-sheet h1')?.textContent === 'Pending species choices'")
            assert page.locator('.cb-unresolved').count() > 0
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            assert page.locator('.cb-draft-summary').count() == 1
            assert page.locator('.cb-abilities').count() == 0
            assert page.locator('.cb-spell').count() == 0

            document['name'] = ('A very long character name for print layout ' * 4).strip()
            document['session']['notes'] = 'START OF LONG NOTE\n' + ('A long note must wrap and remain readable on paper. ' * 170) + '\nEND OF LONG NOTE'
            assert len(document['session']['notes']) <= 10000
            upload(page, document)
            page.wait_for_function('''name => document.querySelector('.cb-character-sheet h1')?.textContent === name''', arg=document['name'])
            page.set_viewport_size({'width': 390, 'height': 844})
            check_width(page)
            page.set_viewport_size({'width': 1100, 'height': 1300})
            long_pdf = output / 'long-notes.pdf'
            long_pages = export_pdf(page, long_pdf)
            text = subprocess.check_output(['pdftotext', str(long_pdf), '-'], text=True)
            assert 'START OF LONG NOTE' in text and 'END OF LONG NOTE' in text
            assert re.sub(r'\s+', ' ', text).count('A long note must wrap') == 170, 'Long notes were clipped during printing.'
            results.append({'example': 'long-notes', 'pages': long_pages})

            page.evaluate('() => { window.previewPrintCalled=false; window.print=()=>{window.previewPrintCalled=true}; }')
            page.click('#print-sheet')
            assert page.evaluate('window.previewPrintCalled') is True

            # Build and revise a character through the editor, then round-trip its save.
            page.click('#new-fighter')
            with page.expect_download() as download_info:
                page.click('#save-character')
            first_id = json.loads(Path(download_info.value.path()).read_text())['id']
            page.click('#new-fighter')
            with page.expect_download() as download_info:
                page.click('#save-character')
            assert json.loads(Path(download_info.value.path()).read_text())['id'] != first_id
            editor = page.locator('#fighter-editor')
            assert editor.is_visible()
            page.screenshot(path=str(output / 'fighter-editor-desktop.png'))
            page.set_viewport_size({'width': 390, 'height': 844})
            check_width(page)
            page.screenshot(path=str(output / 'fighter-editor-mobile.png'))
            page.set_viewport_size({'width': 1100, 'height': 1300})
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            # Level-gated choices stay hidden at level 1, and choices with a
            # single legal option are shown as fixed values and saved without an
            # extra interaction.
            assert editor.get_by_label('Subclass', exact=True).count() == 0
            assert editor.get_by_label('Level 4 Feat', exact=True).count() == 0
            assert editor.get_by_label('Level 4 Ability Increases', exact=True).count() == 0
            assert 'Only one option is legal' in group_text(page, editor, 'Starting Equipment')
            assert 'Chain Mail' in group_text(page, editor, 'Starting Equipment')
            assert 'Defense' in group_text(page, editor, 'Fighting Style')
            assert 'Dice Set' in group_text(page, editor, 'Background Tool')
            editor.get_by_label('Character name').fill('Created fighter')
            editor.get_by_label('Character name').press('Tab')
            # The method decides the control: standard-array values are picked
            # from the ones no other ability uses, so duplicates cannot be
            # entered and the remaining values stay visible.
            editor.get_by_label('Strength', exact=True).select_option('15')
            assert '1 of 6 assigned. Values left: 14, 13, 12, 10, 8.' in editor.locator('.cb-editor__score-status').inner_text()
            assert editor.get_by_label('Dexterity', exact=True).locator('option[value="15"]').get_attribute('disabled') is not None
            editor.get_by_role('button', name='Close editor').click()
            page.click('#edit-fighter')
            assert editor.get_by_label('Strength', exact=True).input_value() == '15'
            for ability, value in {'Strength': 15, 'Dexterity': 13, 'Constitution': 14, 'Intelligence': 12, 'Wisdom': 10, 'Charisma': 8}.items():
                editor.get_by_label(ability, exact=True).select_option(str(value))
            # The selected method explains what is still available, and the
            # combined scores include the background increases edited beside them.
            assert 'All six standard-array values are assigned.' in editor.locator('.cb-editor__score-status').inner_text()
            for label, value in {
                'Gnomish Lineage': 'forest',
                'Species Spellcasting Ability': 'int',
                'Background Ability Increases': 'str-2.con-1',
            }.items():
                control = editor.get_by_label(label, exact=True)
                control.focus()
                control.select_option(value)
                assert page.evaluate("document.activeElement.getAttribute('aria-label')") == label
            assert '17 (+3)' in final_score(editor, 'Strength')
            assert '15 + 2' in final_score(editor, 'Strength')
            # Point buy keeps the entered values where they still fit the
            # budget and can no longer exceed it: the plus buttons lock at 15
            # and when no points are left.
            editor.get_by_label('Point Buy', exact=True).check()
            point_buy_status = editor.locator('.cb-editor__score-status').inner_text()
            assert 'All 27 points are spent.' in point_buy_status, point_buy_status
            assert '27 points' in group_text(page, editor, 'Base ability scores')
            assert editor.get_by_role('button', name='Increase Strength').is_disabled()
            editor.get_by_role('button', name='Decrease Strength').click()
            assert '25 of 27 points spent. 2 left.' in editor.locator('.cb-editor__score-status').inner_text()
            assert editor.get_by_role('button', name='Increase Strength').is_enabled()
            editor.get_by_role('button', name='Increase Strength').click()
            assert 'All 27 points are spent.' in editor.locator('.cb-editor__score-status').inner_text()
            # Switching methods restores what that method held before.
            editor.get_by_label('Standard Array', exact=True).check()
            assert editor.get_by_label('Strength', exact=True).input_value() == '15'
            # Manual entry takes table rolls, flags out-of-range values instead
            # of coercing them, and clears the saved scores until they are fixed.
            editor.get_by_label('Manual', exact=True).check()
            assert editor.get_by_label('Strength', exact=True).input_value() == '15'
            editor.get_by_label('Strength', exact=True).fill('21')
            editor.get_by_label('Strength', exact=True).press('Tab')
            assert 'must be between 1 and 20' in editor.locator('.cb-editor__score-status').inner_text()
            assert editor.get_by_label('Strength', exact=True).get_attribute('aria-invalid') == 'true'
            assert 'Assign the six base ability scores.' in page.locator('.cb-draft-summary').inner_text()
            editor.get_by_label('Strength', exact=True).fill('15')
            editor.get_by_label('Strength', exact=True).press('Tab')
            assert 'All six scores are within 1–20.' in editor.locator('.cb-editor__score-status').inner_text()
            assert 'Assign the six base ability scores.' not in page.locator('.cb-draft-summary').inner_text()
            editor.get_by_label('Standard Array', exact=True).check()
            assert editor.get_by_label('Strength', exact=True).input_value() == '15'
            for label in ['Gnomish', 'Dwarvish', 'Perception', 'Survival', 'Longsword (Sap)', 'Javelin (Slow)', 'Handaxe (Vex)']:
                control = editor.get_by_label(label, exact=True)
                control.check()
                assert page.evaluate("document.activeElement.type") == 'checkbox'
            assert editor.get_by_label('Common', exact=True).is_checked()
            assert editor.get_by_label('Common', exact=True).is_disabled()
            assert editor.get_by_label('Elvish', exact=True).is_disabled()
            assert editor.get_by_label('Flail (Sap)', exact=True).is_disabled()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('tr[data-ability="str"] .cb-number').first.inner_text() == '17'
            assert page.locator('.cb-hp-max').inner_text() == '/ 12'
            assert '+5' in page.locator('.cb-attack-panel').inner_text()
            for ability in ['int', 'wis', 'cha']:
                assert 'Adv.' in page.locator(f'tr[data-ability="{ability}"] .cb-save').inner_text()
            assert page.locator('.cb-resource').filter(has_text='Speak with Animals').count() == 1
            editor.get_by_label('Gnomish Lineage', exact=True).select_option('rock')
            assert page.locator('.cb-resource').filter(has_text='Speak with Animals').count() == 0
            editor.get_by_label('Gnomish Lineage', exact=True).select_option('forest')
            assert page.locator('.cb-resource').filter(has_text='Speak with Animals').count() == 1
            editor.get_by_label('Handaxe (Vex)', exact=True).uncheck()
            editor.get_by_label('Dagger (Nick)', exact=True).check()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('.cb-feature-reference h3').filter(has_text='Nick').count() == 1
            editor.get_by_label('Dagger (Nick)', exact=True).uncheck()
            editor.get_by_label('Handaxe (Vex)', exact=True).check()
            editor.get_by_label('Level', exact=True).select_option('3')
            assert 'Champion' in group_text(page, editor, 'Subclass')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            editor.get_by_label('Level', exact=True).select_option('5')
            assert 'Ability Score Improvement' in group_text(page, editor, 'Level 4 Feat')
            editor.get_by_label('Level 4 Ability Increases', exact=True).select_option('str-1.con-1')
            assert '18 (+4)' in final_score(editor, 'Strength')
            editor.get_by_label('Flail (Sap)', exact=True).check()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('tr[data-ability="str"] .cb-number').first.inner_text() == '18'
            assert page.locator('.cb-hp-max').inner_text() == '/ 49'
            assert '+7' in page.locator('.cb-attack-panel').inner_text()
            assert '2 attacks' in page.locator('.cb-attack-panel').inner_text()
            fighter_pdf = output / 'created-fighter.pdf'
            export_pdf(page, fighter_pdf)
            pdf_text = re.sub(r'\s+', ' ', subprocess.check_output(['pdftotext', str(fighter_pdf), '-'], text=True))
            second_wind = page.locator('.cb-feature-reference').filter(has=page.get_by_role('heading', name='Second Wind', exact=True))
            second_wind_paragraphs = second_wind.locator('.cb-spell-body p').all_text_contents()
            assert second_wind_paragraphs
            for paragraph in second_wind_paragraphs:
                original = re.sub(r'\s+', ' ', paragraph).strip()
                if original:
                    assert original in pdf_text, f'Second Wind description is clipped: {original[:100]}'
            with page.expect_download() as download_info:
                page.click('#save-character')
            saved = json.loads(Path(download_info.value.path()).read_text())
            assert saved['name'] == 'Created fighter' and saved['build']['level'] == 5
            assert saved['build']['abilities']['scores']['str'] == 15
            editor.get_by_label('Level', exact=True).select_option('1')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            editor.get_by_label('Level', exact=True).select_option('5')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            upload(page, saved)
            assert page.locator('.cb-character-sheet h1').inner_text() == 'Created fighter'
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'

            saved['session']['notes'] = 'Keep this session note.'
            saved['session']['hp'] = {'current': 9, 'temporary': 2}
            saved['session']['resources'] = [{'id': 'class:fighter|xphb:second-wind', 'spent': 1}]
            saved['build']['choices'].append({'id': 'custom:unknown-choice', 'selected': ['custom-value']})
            upload(page, saved)
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Opened character.json')")
            page.click('#edit-fighter')
            assert 'custom:unknown-choice: custom-value' in editor.inner_text()
            editor.get_by_label('Character name').fill('Edited fighter')
            editor.get_by_label('Character name').press('Tab')
            with page.expect_download() as download_info:
                page.click('#save-character')
            retained = json.loads(Path(download_info.value.path()).read_text())
            assert retained['build']['choices'] == saved['build']['choices']
            assert retained['session'] == saved['session']
            editor.get_by_role('button', name='Remove choice custom:unknown-choice').click()
            with page.expect_download() as download_info:
                page.click('#save-character')
            retained = json.loads(Path(download_info.value.path()).read_text())
            assert all(choice['id'] != 'custom:unknown-choice' for choice in retained['build']['choices'])
            assert retained['session'] == saved['session']

            level_one = json.loads(json.dumps(saved))
            level_one['build']['level'] = 1
            level_one['build']['choices'] = [choice for choice in level_one['build']['choices'] if choice['id'] not in {
                'class:fighter|xphb:subclass', 'class:fighter|xphb:level-4-feat',
                'class:fighter|xphb:level-4-ability-increases', 'custom:unknown-choice',
            }]
            next(choice for choice in level_one['build']['choices'] if choice['id'].endswith(':weapon-masteries'))['selected'].remove('flail|xphb')
            level_one['build']['choices'].append({'id': 'class:fighter|xphb:subclass', 'selected': []})
            upload(page, level_one)
            page.wait_for_function("document.querySelector('#status').textContent.startsWith('Opened character.json')")
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            page.click('#edit-fighter')
            editor.get_by_role('button', name='Remove saved choice Subclass').click()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'

            # An error during recalculation must leave both document and form unchanged.
            page.evaluate('''async () => {
                const {createSpeciesCatalog} = await import('/js/character-builder/species-catalog.js');
                const {createCharacterEditor} = await import('/js/character-builder/character-editor.js');
                const {createEditorProfiles} = await import('/js/character-builder/editor-profile.js');
                const get = path => fetch(path).then(response => response.json());
                const [races, spells, speciesRules, rules, skills, fighter, backgrounds] = await Promise.all([
                    get('/data/races.json'), get('/data/spells/spells-xphb.json'),
                    get('/js/character-builder/rules/species.json'), get('/js/character-builder/rules/character-sheet.json'), get('/data/skills.json'),
                    get('/data/class/class-fighter.json'), get('/data/backgrounds.json')
                ]);
                const catalog = createSpeciesCatalog({races, spells, rules:speciesRules});
                const container = document.createElement('section');
                container.id = 'transaction-test-editor';
                document.body.append(container);
                let accepted = null;
                let allow = true;
                const [fighterProfile] = createEditorProfiles({catalog, rules, sources:{skills, fighter, backgrounds, abilityNames:Parser.ATB_ABV_TO_FULL}});
                const editor = createCharacterEditor({container, catalog, profiles:[fighterProfile], context:{rules, sources:{skills, fighter, backgrounds, abilityNames:Parser.ATB_ABV_TO_FULL}}, onChange:next => {
                    if (!allow) return false;
                    accepted = next;
                    return true;
                }});
                editor.create('fighter');
                const unsupportedLevel = JSON.parse(JSON.stringify(accepted));
                unsupportedLevel.build.level = 6;
                if (editor.canEdit(unsupportedLevel)) throw new Error('Editor accepted an unsupported Fighter level');
                allow = false;
                window.testAcceptedCharacter = () => accepted;
            }''')
            transaction = page.locator('#transaction-test-editor')
            rejected_name = transaction.get_by_label('Character name')
            rejected_name.focus()
            rejected_name.fill('Rejected edit')
            rejected_name.dispatch_event('change')
            assert transaction.get_by_label('Character name').input_value() == 'New Character'
            assert page.evaluate("document.activeElement.dataset.cbFocus") == 'character:name'
            assert page.evaluate('window.testAcceptedCharacter().name') == 'New Character'
            rejected_score = transaction.get_by_label('Strength', exact=True)
            rejected_score.focus()
            rejected_score.select_option('15')
            assert transaction.get_by_label('Strength', exact=True).input_value() == ''
            assert page.evaluate("document.activeElement.dataset.cbFocus") == 'character:score:str'
            rejected_method = transaction.get_by_label('Point Buy', exact=True)
            rejected_method.focus()
            rejected_method.click()
            assert transaction.get_by_label('Standard Array', exact=True).is_checked()
            assert page.evaluate("document.activeElement.dataset.cbFocus") == 'character:score-method:pointBuy'

            # Create a Warlock from scratch and verify level-based spell grants.
            page.locator('#transaction-test-editor').evaluate('(element) => element.remove()')
            page.click('#new-warlock')
            editor = page.locator('#fighter-editor')
            assert 'Warlock editor' in editor.inner_text()
            # The class fixes Charisma, so every selected source allows exactly
            # one spellcasting ability; it is shown as a fixed value instead of a
            # selector.
            assert editor.get_by_label('Species Spellcasting Ability', exact=True).count() == 0
            assert editor.get_by_label('Magic Initiate Spellcasting Ability', exact=True).count() == 0
            assert 'Charisma is the only spellcasting ability' in group_text(page, editor, 'Species Spellcasting Ability')
            assert 'Charisma is the only spellcasting ability' in group_text(page, editor, 'Magic Initiate Spellcasting Ability')
            assert 'Charisma' in group_text(page, editor, 'Species Spellcasting Ability')
            assert editor.get_by_label('Subclass', exact=True).count() == 0
            assert editor.get_by_label('Level 4 Feat', exact=True).count() == 0
            assert editor.get_by_label('Level 4 Ability Increases', exact=True).count() == 0
            assert editor.get_by_label('Agonizing Blast Cantrip', exact=True).count() == 0
            assert editor.get_by_label('Repelling Blast Cantrip', exact=True).count() == 0
            assert 'Healing Word' in group_text(page, editor, 'Magic Initiate Level 1 Spell')
            assert 'Leather Armor' in group_text(page, editor, 'Starting Equipment')
            editor.get_by_label('Character name').fill('Created warlock')
            editor.get_by_label('Character name').press('Tab')
            for ability, value in {'Strength': 8, 'Dexterity': 14, 'Constitution': 13, 'Intelligence': 12, 'Wisdom': 10, 'Charisma': 15}.items():
                editor.get_by_label(ability, exact=True).select_option(str(value))
            for label, value in {
                'Fiendish Legacy': 'infernal',
                'Size': 'medium',
                'Background Ability Increases': 'cha-2.wis-1',
                'Eldritch Invocations': 'eldritch-mind|xphb',
            }.items():
                editor.get_by_label(label, exact=True).select_option(value)
            # Long option lists can be narrowed by name. Filtering never changes
            # saved decisions; selected entries stay visible, and the query
            # survives an editor redraw.
            assert editor.get_by_label('Filter Prepared Warlock Spells', exact=True).count() == 1
            language_filter = editor.get_by_label('Filter Languages', exact=True)
            language_filter.fill('drac')
            assert editor.get_by_label('Draconic', exact=True).is_visible()
            assert editor.get_by_label('Elvish', exact=True).is_hidden()
            editor.get_by_label('Draconic', exact=True).check()
            language_filter = editor.get_by_label('Filter Languages', exact=True)
            assert language_filter.input_value() == 'drac'
            language_filter.fill('wish')
            assert editor.get_by_label('Draconic', exact=True).is_visible()
            assert editor.get_by_label('Elvish', exact=True).is_hidden()
            assert editor.locator('.cb-editor__filter-status').filter(has_text='No options match this filter').is_visible()
            language_filter.fill('')
            assert editor.get_by_label('Elvish', exact=True).is_visible()
            assert editor.locator('.cb-editor__filter-status').filter(has_text='No options match this filter').count() == 0
            for label in ['Draconic', 'Elvish', 'Arcana', 'Intimidation', 'Guidance', 'Light', 'Eldritch Blast', 'Mind Sliver', 'Armor of Agathys', 'Hex']:
                editor.get_by_label(label, exact=True).check()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('.cb-resource').filter(has_text='Hellish Rebuke').count() == 0
            assert page.locator('.cb-resource').filter(has_text='Pact Magic').count() == 1
            editor.get_by_label('Level', exact=True).select_option('3')
            assert 'Fiend' in group_text(page, editor, 'Subclass')
            # Invocation-gated cantrip choices appear only after their invocation
            # is selected.
            assert editor.get_by_label('Agonizing Blast Cantrip', exact=True).count() == 0
            assert editor.get_by_label('Repelling Blast Cantrip', exact=True).count() == 0
            for label in ['Armor of Shadows', 'Agonizing Blast', 'Mirror Image', 'Misty Step']:
                editor.get_by_label(label, exact=True).check()
            assert 'Eldritch Blast' in group_text(page, editor, 'Agonizing Blast Cantrip')
            assert editor.get_by_label('Repelling Blast Cantrip', exact=True).count() == 0
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('.cb-resource').filter(has_text='Hellish Rebuke').count() == 1
            assert page.locator('.cb-resource').filter(has_text='Darkness').count() == 0
            editor.get_by_label('Level', exact=True).select_option('5')
            assert 'Ability Score Improvement' in group_text(page, editor, 'Level 4 Feat')
            # Invocations appear only when their annotated prerequisite is
            # selected, and the ones whose choices are not reviewed yet are
            # withheld with the reason beside the group.
            assert editor.get_by_label('Pact of the Blade', exact=True).count() == 1
            assert editor.get_by_label('Thirsting Blade', exact=True).count() == 0
            assert editor.get_by_label('Pact of the Tome', exact=True).count() == 0
            assert 'Pact of the Tome' in group_text(page, editor, 'Eldritch Invocations')
            # A dependent choice leaves with its prerequisite: the Pact Weapon is
            # offered only while Pact of the Blade is selected, and deselecting
            # the invocation removes the saved weapon instead of leaving an
            # unavailable group behind.
            editor.get_by_label('Pact of the Blade', exact=True).check()
            assert editor.get_by_label('Pact Weapon', exact=True).count() == 1
            editor.get_by_label('Pact Weapon', exact=True).select_option('longsword|xphb')
            editor.get_by_label('Pact of the Blade', exact=True).uncheck()
            assert editor.get_by_label('Pact Weapon', exact=True).count() == 0
            editor.get_by_label('Pact of the Blade', exact=True).check()
            assert editor.get_by_label('Pact Weapon', exact=True).input_value() == ''
            editor.get_by_label('Pact of the Blade', exact=True).uncheck()
            editor.get_by_label('Level 4 Ability Increases', exact=True).select_option('con-1.cha-1')
            # Spell lists expose the same filter once they grow, and level and
            # school hints are searchable along with names.
            spell_filter = editor.get_by_label('Filter Prepared Warlock Spells', exact=True)
            spell_filter.fill('enchantment')
            assert editor.get_by_label('Hex', exact=True).is_visible()
            assert editor.get_by_label('Charm Person', exact=True).is_visible()
            assert editor.get_by_label('Invisibility', exact=True).is_hidden()
            assert editor.get_by_label('Armor of Agathys', exact=True).is_visible()
            assert editor.locator('.cb-editor__filter-status').filter(has_text='Showing 11 of 41 options').is_visible()
            spell_filter.fill('wish')
            assert editor.get_by_label('Hex', exact=True).is_visible()
            assert editor.get_by_label('Invisibility', exact=True).is_hidden()
            assert editor.locator('.cb-editor__filter-status').filter(has_text='No options match this filter').is_visible()
            spell_filter.fill('')
            assert editor.get_by_label('Invisibility', exact=True).is_visible()
            for label in ['Mage Hand', 'Counterspell', 'Hunger of Hadar', "Devil's Sight", 'Repelling Blast']:
                editor.get_by_label(label, exact=True).check()
            assert 'Eldritch Blast' in group_text(page, editor, 'Repelling Blast Cantrip')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert page.locator('.cb-resource').filter(has_text='Hellish Rebuke').count() == 1
            assert page.locator('.cb-resource').filter(has_text='Darkness').count() == 1
            # Thirsting Blade gives the Pact Weapon an Extra Attack and Eldritch
            # Smite adds slot-fuelled damage, both shown on that attack. Swapping
            # out three invocations without dependent choices keeps the five
            # slots exact, so the sheet stays complete while they are checked.
            for label in ['Armor of Shadows', "Devil's Sight", 'Eldritch Mind']:
                editor.get_by_label(label, exact=True).uncheck()
            editor.get_by_label('Pact of the Blade', exact=True).check()
            editor.get_by_label('Pact Weapon', exact=True).select_option('longsword|xphb')
            editor.get_by_label('Thirsting Blade', exact=True).check()
            editor.get_by_label('Eldritch Smite', exact=True).check()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            assert '2 attacks' in page.locator('.cb-attack-panel').inner_text()
            assert 'Eldritch Smite: 4d8 Force' in page.locator('.cb-attack-panel').inner_text()
            assert 'expending a Pact Magic slot (level 3)' in page.locator('.cb-attack-panel').inner_text()
            editor.get_by_label('Eldritch Smite', exact=True).uncheck()
            editor.get_by_label('Thirsting Blade', exact=True).uncheck()
            editor.get_by_label('Pact of the Blade', exact=True).uncheck()
            for label in ['Armor of Shadows', "Devil's Sight", 'Eldritch Mind']:
                editor.get_by_label(label, exact=True).check()
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            warlock_pdf = output / 'created-warlock.pdf'
            export_pdf(page, warlock_pdf)
            pdf_text = re.sub(r'\s+', ' ', subprocess.check_output(['pdftotext', str(warlock_pdf), '-'], text=True))
            assert 'Hellish Rebuke' in pdf_text and 'Darkness' in pdf_text and 'Pact Magic' in pdf_text
            hellish_rebuke = page.locator('.cb-spell[data-spell="spell:hellish-rebuke|xphb"] .cb-spell-body p').all_text_contents()
            assert hellish_rebuke
            for paragraph in hellish_rebuke:
                original = re.sub(r'\s+', ' ', paragraph).strip()
                if original:
                    assert original in pdf_text, f'Hellish Rebuke description is clipped: {original[:100]}'
            with page.expect_download() as download_info:
                page.click('#save-character')
            saved_warlock = json.loads(Path(download_info.value.path()).read_text())
            assert saved_warlock['name'] == 'Created warlock' and saved_warlock['build']['level'] == 5
            editor.get_by_label('Level', exact=True).select_option('1')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            editor.get_by_label('Level', exact=True).select_option('5')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            upload(page, saved_warlock)
            assert page.locator('.cb-character-sheet h1').inner_text() == 'Created warlock'
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'complete'
            mixed_warlock = json.loads(json.dumps(saved_warlock))
            mixed_warlock['name'] = 'Imported mixed warlock'
            next(choice for choice in mixed_warlock['build']['choices'] if choice['id'] == 'species:tiefling|xphb:spellcasting-ability')['selected'] = ['int']
            next(choice for choice in mixed_warlock['build']['choices'] if choice['id'] == 'feat:magic-initiate-cleric|xphb:ability')['selected'] = ['wis']
            mixed_warlock['session']['notes'] = 'Preserve imported session notes.'
            upload(page, mixed_warlock)
            page.wait_for_function("document.querySelector('.cb-character-sheet h1')?.textContent === 'Imported mixed warlock'")
            page.click('#edit-fighter')
            assert editor.get_by_label('Species Spellcasting Ability', exact=True).input_value() == 'int'
            assert editor.get_by_label('Magic Initiate Spellcasting Ability', exact=True).input_value() == 'wis'
            with page.expect_download() as download_info:
                page.click('#save-character')
            retained_warlock = json.loads(Path(download_info.value.path()).read_text())
            assert retained_warlock['build']['choices'] == mixed_warlock['build']['choices']
            assert retained_warlock['session'] == mixed_warlock['session']

            # Compose a cross-preset character through the independent selectors.
            page.select_option('#new-species', 'Gnome|XPHB')
            page.select_option('#new-class', 'Warlock|XPHB')
            page.select_option('#new-background', 'Soldier|XPHB')
            page.click('#new-character')
            editor = page.locator('#fighter-editor')
            assert 'Character editor' in editor.inner_text()
            assert editor.get_by_label('Gnomish Lineage', exact=True).input_value() == ''
            assert 'Charisma is the only spellcasting ability' in group_text(page, editor, 'Species Spellcasting Ability')
            assert 'Dice Set' in group_text(page, editor, 'Background Tool')
            assert page.locator('.cb-character-sheet').get_attribute('data-sheet-status') == 'incomplete'
            assert not errors, errors
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    assert not layout_errors, f'Main sheets exceed A4: {json.dumps(layout_errors)}'
    print(f'Browser, import, mobile, and PDF checks passed. Artifacts: {output}')


if __name__ == '__main__':
    main()
