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

    def wait_for(expression):
        for _ in range(100):
            if evaluate(expression):
                return
            time.sleep(0.1)
        image = command('Page.captureScreenshot', {'format': 'png'})
        (output / 'feedback-failure.png').write_bytes(base64.b64decode(image['data']))
        details = evaluate("({title:document.querySelector('.swal2-title')?.innerText,form:document.querySelector('[role=dialog]')?.innerText,input:document.querySelector('[role=dialog] input:not([type=password])')?.value})")
        raise RuntimeError('Browser condition timed out: ' + expression + ' ' + json.dumps(details, ensure_ascii=True))

    command('Page.enable')
    command('Network.enable')
    command('Network.setCookie', {'url': base, 'name': 'hr_session', 'value': request['cookie'].split('=', 1)[1], 'httpOnly': True, 'path': '/', 'sameSite': 'Lax'})
    output = Path(__file__).resolve().parent.parent / 'imports' / 'verification'
    output.mkdir(parents=True, exist_ok=True)
    metrics = []
    for width in (390, 1440):
        command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 900, 'deviceScaleFactor': 1, 'mobile': width < 768})
        for route in request.get('routes', ('/', '/chuc-danh', '/ngan-sach-luong', '/so-do-to-chuc', '/so-do-luu-tru', '/nhan-vien', '/timeline')):
            command('Page.navigate', {'url': base + route})
            for _ in range(100):
                time.sleep(0.15)
                if evaluate("Boolean(document.querySelector('.app-main')) && !/Đang tải|Đang tổng hợp/.test(document.querySelector('.app-main').innerText)"):
                    break
            else:
                raise RuntimeError(f'Page not ready: {route}')
            if route == '/so-do-to-chuc/phong-ban':
                time.sleep(0.5)
                bounds = evaluate("""(() => {const f=document.querySelector('.personnel-fit-scroll');const nodes=[...f.querySelectorAll('.person-node')];f.scrollLeft=0;return {width:f.clientWidth,scrollWidth:f.scrollWidth,left:nodes[0].getBoundingClientRect().left-frameLeft(f),x:f.getBoundingClientRect().left+f.clientWidth/2,y:f.getBoundingClientRect().top+Math.min(120,f.clientHeight/2),scale:document.querySelector('.personnel-fit-controls span').innerText};function frameLeft(frame){return frame.getBoundingClientRect().left;}})()""")
                if bounds['scale'] != '100%' or bounds['left'] < -1:
                    raise RuntimeError('Leftmost personnel node is inaccessible at 100%')
                if bounds['scrollWidth'] <= bounds['width']:
                    raise RuntimeError('Expected a wide chart fixture')
                x, y = bounds['x'], bounds['y']
                for target_x in (x-110, x+110):
                    before = evaluate("document.querySelector('.personnel-fit-scroll').scrollLeft")
                    command('Input.dispatchMouseEvent', {'type':'mousePressed','x':x,'y':y,'button':'left','clickCount':1})
                    command('Input.dispatchMouseEvent', {'type':'mouseMoved','x':target_x,'y':y,'button':'left','buttons':1})
                    command('Input.dispatchMouseEvent', {'type':'mouseReleased','x':target_x,'y':y,'button':'left','clickCount':1})
                    time.sleep(0.1)
                    after = evaluate("document.querySelector('.personnel-fit-scroll').scrollLeft")
                    if (target_x < x and after <= before) or (target_x > x and after >= before):
                        raise RuntimeError(f'Chart drag failed: width={width}, before={before}, after={after}, target={target_x}')
                right = evaluate("""(() => {const f=document.querySelector('.personnel-fit-scroll');f.scrollLeft=f.scrollWidth;const nodes=[...f.querySelectorAll('.person-node')];return {right:nodes.at(-1).getBoundingClientRect().right,edge:f.getBoundingClientRect().right};})()""")
                if right['right'] > right['edge']+1:
                    raise RuntimeError('Rightmost personnel node is inaccessible at 100%')
                evaluate("document.querySelector('.personnel-fit-scroll').scrollLeft=0")
            if route == '/thuong-du-an':
                wait_for("document.querySelectorAll('.app-main section[aria-label] > header').length===2")
                if evaluate("Boolean(document.querySelector('nav[aria-label=\"Qu\u1ea3n l\u00fd th\u01b0\u1edfng\"]'))"):
                    raise RuntimeError('Bonus page still has tabs')
                evaluate("document.querySelector('.app-main section[aria-label] > header button').click()")
                wait_for("document.querySelectorAll('[role=dialog] select').length===2")
                evaluate("(() => {const s=document.querySelectorAll('[role=dialog] select')[1];s.value=[...s.options].find(o=>o.text==='Department fund policy').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
                wait_for("document.querySelectorAll('[role=dialog] input[inputmode=numeric]').length===1")
                for index, value in enumerate(('10000000',)):
                    evaluate(f"document.querySelectorAll('[role=dialog] input[inputmode=numeric]')[{index}].focus()")
                    command('Input.insertText', {'text': value})
                wait_for("document.querySelector('[role=dialog]').innerText.includes('10.000.000')")
                if evaluate("document.documentElement.scrollWidth>innerWidth"):
                    raise RuntimeError('Bonus form causes page overflow')
                image = command('Page.captureScreenshot', {'format':'png'})
                (output / f'bonus-department-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='Hủy').click()")
                evaluate("document.querySelector('.app-main section[aria-label] > header button').click()")
                wait_for("document.querySelectorAll('[role=dialog] select').length===2")
                evaluate("(() => {const s=document.querySelectorAll('[role=dialog] select')[1];s.value=[...s.options].find(o=>o.text==='Local percentage policy').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
                wait_for("document.querySelectorAll('[role=dialog] select').length===3 && document.querySelectorAll('[role=dialog] input[inputmode=numeric]').length===1")
                evaluate("document.querySelector('[role=dialog] input[inputmode=numeric]').focus()")
                command('Input.insertText', {'text':'100000000'})
                wait_for("document.querySelector('[role=dialog]').innerText.includes('2.500.000')")
                image = command('Page.captureScreenshot', {'format':'png'})
                (output / f'bonus-employee-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='Hủy').click()")
            if route == '/timeline':
                time.sleep(0.5)
                if not evaluate("Boolean(document.querySelector('table'))"):
                    raise RuntimeError('Expected Table as the default task view')
                evaluate("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Ti\u1ebfn \u0111\u1ed9').click()")
                time.sleep(0.2)
                controls = evaluate("""(() => {const main=document.querySelector('.app-main');const select=main.querySelector('select[aria-label="Lọc nhân viên"]');return {mine:select?.querySelector('option[value="mine"]')!==null,duplicate:[...main.querySelectorAll('button')].some(b=>b.innerText==='Trong phạm vi quyền'),overflow:document.documentElement.scrollWidth>innerWidth};})()""")
                if not controls['mine'] or controls['duplicate'] or controls['overflow']:
                    raise RuntimeError('Task filter or board layout check failed')
                image = command('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
                (output / f'timeline-board-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("[...document.querySelectorAll('button')].find(b=>b.innerText==='Bảng').click()")
                time.sleep(0.25)
                if not evaluate("Boolean(document.querySelector('table'))"):
                    raise RuntimeError('Task table view did not open')
                first_task = evaluate("document.querySelector('tbody tr')?.innerText")
                evaluate("document.querySelector('nav[aria-label=\"Phân trang\"] button[aria-label=\"Trang 2\"]').click()")
                for _ in range(80):
                    time.sleep(0.1)
                    if evaluate("Boolean(document.querySelector('tbody tr')) && document.querySelector('tbody tr').innerText!==" + json.dumps(first_task)):
                        break
                else:
                    raise RuntimeError('Pagination did not fetch the next task page')
                evaluate("(() => {const s=document.querySelector('select[aria-label=\"Số dòng mỗi trang\"]');s.value='10';s.dispatchEvent(new Event('change',{bubbles:true}));})()")
                for _ in range(80):
                    time.sleep(0.1)
                    if evaluate("document.querySelectorAll('tbody tr').length===10 && document.querySelector('nav[aria-label=\"Phân trang\"] [aria-current=page]')?.innerText==='1'"):
                        break
                else:
                    raise RuntimeError('Page-size change did not reset and fetch page one')
            if request.get('feedback') and route == '/phong-ban':
                # Exercise the real UI against the disposable local database only.
                wait_for("Boolean(document.querySelector('.app-main .font-display'))")
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.includes('Thêm phòng ban')).click()")
                wait_for("Boolean(document.querySelector('[role=dialog] input'))")
                evaluate("document.querySelector('[role=dialog] input').focus()")
                duplicate_name = evaluate("document.querySelector('.app-main .font-display').innerText")
                command('Input.insertText', {'text': duplicate_name})
                evaluate("document.querySelector('[role=dialog] form').requestSubmit()")
                wait_for("Boolean(document.querySelector('.swal2-toast.swal2-icon-error'))")
                evaluate("document.querySelector('.swal2-close').click()")
                wait_for("!document.querySelector('.swal2-toast')")
                evaluate("document.querySelector('[role=dialog] input').select()")
                name = f'Alert UI verification {width}'
                command('Input.insertText', {'text': name})
                evaluate("document.querySelector('[role=dialog] form').requestSubmit()")
                wait_for("Boolean(document.querySelector('.swal2-toast.swal2-icon-success'))")
                wait_for("Boolean(document.querySelector('button[aria-label=' + JSON.stringify('Xóa phòng ban ' + " + json.dumps(name) + ") + ']'))")
                image = command('Page.captureScreenshot', {'format': 'png'})
                (output / f'feedback-success-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('.swal2-close').click()")
                delete_button = "document.querySelector('button[aria-label=' + JSON.stringify('Xóa phòng ban ' + " + json.dumps(name) + ") + ']')"
                evaluate(delete_button + '.click()')
                wait_for("Boolean(document.querySelector('.swal2-popup:not(.swal2-toast)'))")
                if evaluate("document.querySelector('.swal2-popup').getBoundingClientRect().right > innerWidth"):
                    raise RuntimeError('Confirmation overflows the viewport')
                evaluate("document.querySelector('.swal2-cancel').click()")
                wait_for("!document.querySelector('.swal2-popup')")
                if not evaluate('Boolean(' + delete_button + ')'):
                    raise RuntimeError('Cancel unexpectedly deleted a department')
                evaluate(delete_button + '.click()')
                wait_for("Boolean(document.querySelector('.swal2-confirm'))")
                evaluate("document.querySelector('.swal2-confirm').click()")
                wait_for("Boolean(document.querySelector('.swal2-toast.swal2-icon-success'))")
                wait_for('!(' + delete_button + ')')
                evaluate("document.querySelector('.swal2-close').click()")
                wait_for("!document.querySelector('.swal2-toast')")
            if request.get('feedback') and route == '/dinh-bien':
                wait_for("Boolean(document.querySelector('.app-main table tbody button'))")
                evaluate("document.querySelector('.app-main table tbody button').click()")
                wait_for("Boolean(document.querySelector('[role=dialog]'))")
                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='Xóa').click()")
                wait_for("Boolean(document.querySelector('.swal2-textarea'))")
                evaluate("document.querySelector('.swal2-confirm').click()")
                wait_for("Boolean(document.querySelector('.swal2-validation-message')?.textContent)")
                evaluate("document.querySelector('.swal2-textarea').focus()")
                command('Input.insertText', {'text': 'Local feedback verification only'})
                if not evaluate("document.activeElement===document.querySelector('.swal2-textarea')"):
                    raise RuntimeError('Reason input lost keyboard focus')
                image = command('Page.captureScreenshot', {'format': 'png'})
                (output / f'feedback-reason-{width}.png').write_bytes(base64.b64decode(image['data']))
                command('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
                command('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
                wait_for("!document.querySelector('.swal2-popup')")
                if not evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                    raise RuntimeError('Escape closed the underlying employee form')
                evaluate("document.querySelector('[role=dialog] button[aria-label=' + JSON.stringify('Đóng hộp thoại') + ']').click()")
            report = evaluate("""(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth, errors: [...document.querySelectorAll('[role=alert]')].filter(e=>!e.classList.contains('swal2-toast')||e.classList.contains('swal2-icon-error')).map(e=>e.innerText), outside: [...document.querySelectorAll('.app-header,.app-main,.ui-card')].filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1}).map(e=>e.className)}))()""")
            report.update({'route': route, 'width': width})
            metrics.append(report)
            if report['document'] > report['viewport'] or report['outside'] or report['errors']:
                raise RuntimeError('Layout or page error: ' + json.dumps(report, ensure_ascii=True))
            screenshot = command('Page.captureScreenshot', {'format': 'png'})
            filename = ('dashboard' if route == '/' else route.strip('/').replace('/', '-')) + f'-{width}.png'
            (output / filename).write_bytes(base64.b64decode(screenshot['data']))
            if route == '/chuc-danh' and request.get('routes') == ['/chuc-danh']:
                full_duties = evaluate("""(() => {const row=document.querySelector('.app-main article');if(!row)return null;const items=[...row.querySelectorAll('li')];return {count:items.length,clipped:items.some(item=>[...item.querySelectorAll('span')].some(span=>getComputedStyle(span).webkitLineClamp!=='none'&&getComputedStyle(span).webkitLineClamp!=='0'))};})()""")
                if full_duties and (full_duties['count'] < 5 or full_duties['clipped']):
                    raise RuntimeError('Duty text is missing or clipped')
                if full_duties:
                    if evaluate("document.querySelector('.app-main').innerText.includes('Yêu cầu / quyền hạn')"):
                        raise RuntimeError('Removed requirements section is still visible')
                    evaluate("[...document.querySelector('.app-main article').querySelectorAll('button')].find(button=>button.innerText.trim()==='Chi tiết').click()")
                    for _ in range(60):
                        time.sleep(0.1)
                        if evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                            break
                    if not evaluate("document.querySelector('[role=dialog]')?.innerText.includes('Bảo mật thông tin và hồ sơ nội bộ.')"):
                        raise RuntimeError('Full duty detail did not open')
                    if evaluate("document.querySelector('[role=dialog]').innerText.includes('Yêu cầu / quyền hạn')"):
                        raise RuntimeError('Removed requirements section is still visible in detail')
                    if evaluate("[...document.querySelector('[role=dialog]').querySelectorAll('button')].some(button=>/history|versions/i.test(button.innerText)||button.innerText.includes('L\u1ecbch s\u1eed'))"):
                        raise RuntimeError('History tab is still visible for job titles')
                    evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
            if route == '/du-an':
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.includes('Thêm mới')).click()")
                wait_for("Boolean(document.querySelector('[role=dialog] fieldset'))")
                if evaluate("[...document.querySelectorAll('[role=dialog] label')].some(l=>l.innerText.startsWith('Phòng chủ trì'))"):
                    raise RuntimeError('Project form still asks for a lead department')
                evaluate("[...document.querySelectorAll('[role=dialog] fieldset input[type=checkbox]')].slice(0,2).forEach(input=>input.click())")
                if evaluate("document.querySelectorAll('[role=dialog] fieldset input[type=checkbox]:checked').length") != 2:
                    raise RuntimeError('Project form did not retain two participating departments')
                image = command('Page.captureScreenshot', {'format': 'png'})
                (output / f'project-departments-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=' + JSON.stringify('Đóng hộp thoại') + ']').click()")
            if route == '/ngan-sach-luong':
                wait_for("Boolean(document.querySelector('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + ']'))")
                evaluate("document.querySelector('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details summary').click()")
                wait_for("document.querySelectorAll('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details input[type=checkbox]').length>1")
                evaluate("[...document.querySelectorAll('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details input[type=checkbox]')].slice(0,2).forEach(input=>input.click())")
                if evaluate("document.querySelectorAll('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details input[type=checkbox]:checked').length") != 2:
                    raise RuntimeError('Budget filter did not retain multiple departments')
                if evaluate("document.querySelector('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details > div').getBoundingClientRect().right>innerWidth+1"):
                    raise RuntimeError('Budget department dropdown overflows the viewport')
                evaluate("document.querySelector('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details summary').click()")
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'budget-filters-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("[...document.querySelectorAll('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] button')].find(b=>b.innerText.includes('Đặt lại')).click()")
                if evaluate("document.querySelectorAll('section[aria-label=' + JSON.stringify('Bộ lọc ngân sách') + '] details input[type=checkbox]:checked').length"):
                    raise RuntimeError('Budget filter reset failed')
            if route == '/chuc-danh':
                create_label = 'Thêm mới'
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.includes(" + json.dumps(create_label) + ")).click()")
                for _ in range(60):
                    time.sleep(0.1)
                    if evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                        break
                form = evaluate("""(() => {const dialog=document.querySelector('[role=dialog]');if(!dialog)return {missing:true};return {outside:[...dialog.querySelectorAll('input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length,width:dialog.getBoundingClientRect().width}})()""")
                if form.get('missing') or form['outside'] or form['width'] > width:
                    raise RuntimeError('Form outside viewport')
                if route == '/chuc-danh' and evaluate("document.querySelector('[role=dialog]').innerText.includes('Yêu cầu / quyền hạn')"):
                    raise RuntimeError('Removed requirements field is still visible in form')
                image = command('Page.captureScreenshot', {'format': 'png'})
                (output / (route.strip('/') + f'-form-{width}.png')).write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
            if route == '/ngan-sach-luong':
                wait_for("!document.querySelector('[role=dialog]')")
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Nhập quỹ lương').click()")
                wait_for("document.querySelectorAll('[role=dialog] [data-budget-row]').length>=2")
                if evaluate("document.querySelectorAll('[role=dialog] select[aria-label=' + JSON.stringify('Tháng ngân sách — Tháng') + ']').length") != 1:
                    raise RuntimeError('Bulk budget form must use one shared month')
                test_month = '03' if width == 390 else '04'
                evaluate("(() => {const select=document.querySelector('[role=dialog] select[aria-label=' + JSON.stringify('Tháng ngân sách — Tháng') + ']');select.value="+json.dumps(test_month)+";select.dispatchEvent(new Event('change',{bubbles:true}));})()")
                for index, amount in enumerate(('10000000', '20000000')):
                    evaluate("document.querySelectorAll('[role=dialog] [data-budget-row]')["+str(index)+"].querySelector('input[aria-label^=' + JSON.stringify('Quỹ lương dòng') + ']').focus()")
                    command('Input.insertText', {'text': amount})
                wait_for("document.querySelector('[role=dialog] tfoot').innerText.includes('30.000.000')")
                if evaluate("document.documentElement.scrollWidth>innerWidth"):
                    raise RuntimeError('Bulk salary form causes page overflow')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'budget-batch-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[type=submit]').click()")
                wait_for("!document.querySelector('[role=dialog]')")
                wait_for("document.querySelectorAll('.app-main table tbody tr').length===2 && document.querySelector('.app-main table tfoot')?.innerText.includes('30.000.000')")
                if evaluate("Boolean(document.querySelector('.swal2-close'))"):
                    evaluate("document.querySelector('.swal2-close').click()")
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
    print('PASS: desktop/mobile pages and available forms. No document horizontal overflow or cards/forms outside viewport. Screenshots: imports/verification/')
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
