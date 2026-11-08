#!/usr/bin/env python3
"""Check the local draft preview in an installed browser and export review PDFs."""

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
    bounds = page.locator('.cb-page').evaluate_all('''pages => pages.map(page => ({
        width: page.getBoundingClientRect().width,
        overflow: page.scrollWidth > page.clientWidth + 1
    }))''')
    assert bounds and all(abs(item['width'] - 793.7) < 2 for item in bounds), bounds
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
                sheet_text = page.locator('.cb-character-sheet').inner_text()
                assert 'Draft' in sheet_text or 'draft' in sheet_text
                assert '{@' not in page.locator('#sheet-preview').inner_text()
                check_width(page)
                pdf = output / f'{option["value"]}.pdf'
                pages = export_pdf(page, pdf, expected_pages=2)
                results.append({'example': option['value'], 'pages': pages})
                if '5' in option['value']:
                    page.locator('.cb-character-sheet').screenshot(path=str(output / f'{option["value"]}-sheet.png'))
                    page.locator('.cb-spell-reference').screenshot(path=str(output / f'{option["value"]}-spells.png'))
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

            document = json.loads((ROOT / 'test/fixtures/character-builder/tiefling-warlock-draft.json').read_text())
            document['build']['choices'].append({'id': 'species:tiefling|xphb:size', 'selected': ['medium']})

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
            assert page.locator('.cb-spell').count() == 1
            assert 'Thaumaturgy' in page.locator('.cb-spell').inner_text()

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
    print(f'Browser, import, mobile, and PDF checks passed. Artifacts: {output}')


if __name__ == '__main__':
    main()
