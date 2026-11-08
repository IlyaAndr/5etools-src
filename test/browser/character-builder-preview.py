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
            assert not errors, errors
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    assert not layout_errors, f'Main sheets exceed A4: {json.dumps(layout_errors)}'
    print(f'Browser, import, mobile, and PDF checks passed. Artifacts: {output}')


if __name__ == '__main__':
    main()
