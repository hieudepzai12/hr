"""Visual checks against local test fixtures. Session cookie is read from stdin and never logged."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import websocket

request = json.load(sys.stdin)
base = request['base']
if urllib.parse.urlparse(base).hostname not in ('localhost', '127.0.0.1'):
    raise ValueError('Local browser checks only')
browser_path = next((p for p in [Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'), Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')] if p.exists()), None)
if not browser_path:
    raise RuntimeError('No local Chromium browser')
profile = Path(tempfile.mkdtemp(prefix='otis-verify-browser-'))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
browser = subprocess.Popen([str(browser_path), '--headless=new', '--disable-gpu', '--disable-software-rasterizer', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', f'--remote-debugging-port={port}', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
ws = None
try:
    for _ in range(100):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=1) as response:
                target = next(item for item in json.load(response) if item['type'] == 'page')
            break
        except Exception:
            time.sleep(0.1)
    else:
        raise RuntimeError('Browser debugging endpoint unavailable')
    ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=10, http_no_proxy=['127.0.0.1', 'localhost'])
    counter = 0

    def command(method, params=None):
        global counter
        counter += 1
        current = counter
        ws.send(json.dumps({'id': current, 'method': method, 'params': params or {}}))
        while True:
            response = json.loads(ws.recv())
            if response.get('id') == current:
                if response.get('error'):
                    raise RuntimeError(response['error']['message'])
                return response.get('result', {})

    def evaluate(expression):
        result = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
        if result.get('exceptionDetails'):
            raise RuntimeError('Browser evaluation failed')
        return result.get('result', {}).get('value')

    command('Page.enable')
    command('Network.enable')
    command('Network.setCookie', {'url': base, 'name': 'hr_session', 'value': request['cookie'].split('=', 1)[1], 'httpOnly': True, 'path': '/', 'sameSite': 'Lax'})
    output = Path(__file__).resolve().parent.parent / 'imports' / 'verification'
    output.mkdir(parents=True, exist_ok=True)
    metrics = []
    for width in (390, 1440):
        command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 900, 'deviceScaleFactor': 1, 'mobile': width < 768})
        for route in ('/', '/chuc-danh', '/ngan-sach-luong', '/so-do-to-chuc', '/so-do-luu-tru', '/nhan-vien', '/timeline'):
            command('Page.navigate', {'url': base + route})
            for _ in range(100):
                time.sleep(0.15)
                if evaluate("Boolean(document.querySelector('.app-main')) && !/Đang tải|Đang tổng hợp/.test(document.querySelector('.app-main').innerText)"):
                    break
            else:
                raise RuntimeError(f'Page not ready: {route}')
            report = evaluate("""(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, errors: [...document.querySelectorAll('[role=alert]')].map(e=>e.innerText), outside: [...document.querySelectorAll('.app-header,.app-main,.ui-card')].filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1}).map(e=>e.className)}))()""")
            report.update({'route': route, 'width': width})
            metrics.append(report)
            if report['document'] > report['viewport'] or report['outside'] or report['errors']:
                raise RuntimeError('Layout or page error: ' + json.dumps(report, ensure_ascii=True))
            screenshot = command('Page.captureScreenshot', {'format': 'png'})
            filename = ('dashboard' if route == '/' else route.strip('/')) + f'-{width}.png'
            (output / filename).write_bytes(base64.b64decode(screenshot['data']))
            if route in ('/chuc-danh', '/ngan-sach-luong'):
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.includes('Thêm mới')).click()")
                for _ in range(60):
                    time.sleep(0.1)
                    if evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                        break
                form = evaluate("""(() => {const dialog=document.querySelector('[role=dialog]');if(!dialog)return {missing:true};return {outside:[...dialog.querySelectorAll('input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length,width:dialog.getBoundingClientRect().width}})()""")
                if form.get('missing') or form['outside'] or form['width'] > width:
                    raise RuntimeError('Form outside viewport')
                image = command('Page.captureScreenshot', {'format': 'png'})
                (output / (route.strip('/') + f'-form-{width}.png')).write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
            if route == '/':
                if width < 768:
                    evaluate("document.querySelector('button[aria-label=\"Mở menu\"]').click()")
                    time.sleep(0.3)
                    menu = evaluate("(() => {const r=document.getElementById('app-sidebar').getBoundingClientRect();return {left:r.left,right:r.right}})()")
                    if menu['left'] < -1 or menu['right'] > width:
                        raise RuntimeError('Mobile sidebar outside viewport')
                    evaluate("document.getElementById('app-sidebar').querySelector('button[aria-controls=\"app-sidebar\"]').click()")
                elif evaluate("document.querySelector('button[aria-label=\"Mở menu\"]').getBoundingClientRect().width") != 0:
                    raise RuntimeError('Duplicate sidebar toggle on desktop')
    (output / 'layout-metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: 14 desktop/mobile pages, 4 forms, mobile sidebar and desktop toggle. No document horizontal overflow or cards/forms outside viewport. Screenshots: imports/verification/')
finally:
    if ws:
        try:
            ws.send(json.dumps({'id': 99999, 'method': 'Browser.close'}))
        except Exception:
            pass
        ws.close()
    try:
        browser.wait(timeout=5)
    except subprocess.TimeoutExpired:
        browser.terminate()
