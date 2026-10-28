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
    phase = 'before' if os.environ.get('OTIS_UI_PHASE') == 'before' else 'after'
    output = Path(__file__).resolve().parent.parent / '.next-verify' / 'ui-review' / phase
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
            if route == '/nhan-vien':
                if evaluate("Boolean(document.querySelector('.app-main button[title=\"Xem hồ sơ\"]'))"):
                    raise RuntimeError('Personnel list still has the eye button')
                profile_link = "[...document.querySelectorAll('.app-main a[aria-label^=\"Xem thông tin\"]')].find(a=>a.getClientRects().length)"
                if evaluate('Boolean(' + profile_link + ')'):
                    selected_name = evaluate(profile_link + '.innerText')
                    selected_path = evaluate(profile_link + '.getAttribute("href")')
                    evaluate(profile_link + '.click()')
                    wait_for("location.pathname==="+json.dumps(selected_path)+" && [...document.querySelectorAll('.app-main h3')].some(h=>h.innerText==="+json.dumps(selected_name)+")")
                    if evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                        raise RuntimeError('Employee name must open a detail page')
                    image=command('Page.captureScreenshot', {'format':'png'})
                    (output / f'employee-detail-{width}.png').write_bytes(base64.b64decode(image['data']))
                    evaluate("document.querySelector('.app-main a[href=\"/nhan-vien\"]').click()")
                    wait_for("location.pathname==='/nhan-vien' && Boolean("+profile_link+")")
                if evaluate("Boolean(document.querySelector('.app-main button[aria-label^=\"Ngừng hoạt động\"],.app-main button[aria-label^=\"Vô hiệu hóa\"]'))"):
                    raise RuntimeError('Deactivate still appears in personnel list')
                if evaluate("Boolean(document.querySelector('.app-main button[title=\"Đặt lại mật khẩu\"],.app-main button[title=\"Đổi mật khẩu\"]')) || [...document.querySelectorAll('.app-main button')].some(b=>b.innerText.includes('Tạo tài khoản')||b.innerText.includes('Thêm nhân viên'))"):
                    raise RuntimeError('Account creation/password controls remain in personnel menu')
            if route == '/tai-khoan':
                wait_for("Boolean(document.querySelector('.app-main table tbody tr'))")
                account_name = "document.querySelector('.app-main table tbody td:first-child a')"
                selected_name = evaluate(account_name + '.innerText')
                selected_path = evaluate(account_name + '.getAttribute("href")')
                evaluate(account_name + '.click()')
                wait_for("location.pathname==="+json.dumps(selected_path)+" && [...document.querySelectorAll('.app-main h3')].some(h=>h.innerText==="+json.dumps(selected_name)+")")
                command('Page.navigate', {'url':base+'/tai-khoan'})
                wait_for("location.pathname==='/tai-khoan' && Boolean(document.querySelector('.app-main table tbody tr'))")
                if evaluate("Boolean(document.querySelector('.app-main button[title=\"Đổi mật khẩu\"]'))"):
                    raise RuntimeError('Personal password change must be in profile only')
                evaluate("document.querySelector('.app-main button[aria-label^=\"Ngừng hoạt động\"]').click()")
                wait_for("Boolean(document.querySelector('.swal2-cancel'))")
                evaluate("document.querySelector('.swal2-cancel').click()")
                wait_for("!document.querySelector('.swal2-popup')")
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Tạo tài khoản').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] input[type=password]'))")
                if not evaluate("document.querySelector('[role=dialog] input[type=email]').required && document.querySelector('[role=dialog] input[type=password]').minLength===8"):
                    raise RuntimeError('Account form validation is missing')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'account-create-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
                evaluate("document.querySelector('.app-main button[title=\"Đặt lại mật khẩu\"]').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] input#new-password'))")
                if evaluate("Boolean(document.querySelector('[role=dialog] input#current-password'))"):
                    raise RuntimeError('Admin reset incorrectly requires old employee password')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'account-reset-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
            if route == '/ho-so':
                wait_for("Boolean(document.querySelector('section[aria-label=\"Hồ sơ cá nhân\"]'))")
                if evaluate("Boolean(document.querySelector('[aria-label=\"Chọn thông tin cá nhân\"],section[aria-label=\"Profile nhân sự\"]'))"):
                    raise RuntimeError('Separate personnel profile tab/list is still on personal page')
                evaluate("document.querySelector('button[aria-label=\"Mở menu tài khoản\"]').click()")
                wait_for("Boolean(document.querySelector('[role=menu][aria-label=\"Tài khoản cá nhân\"]'))")
                if evaluate("[...document.querySelectorAll('[role=menu][aria-label=\"Tài khoản cá nhân\"] [role=menuitem]')].map(item=>item.innerText)") != ['Thông tin cá nhân','Đổi mật khẩu']:
                    raise RuntimeError('Avatar menu must have exactly two personal actions')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'account-menu-{width}.png').write_bytes(base64.b64decode(image['data']))
                command('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                command('Input.dispatchKeyEvent', {'type':'keyUp','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                wait_for("!document.querySelector('[role=menu][aria-label=\"Tài khoản cá nhân\"]')")
                if not evaluate("document.activeElement===document.querySelector('button[aria-label=\"Mở menu tài khoản\"]')"):
                    raise RuntimeError('Avatar menu did not restore keyboard focus')
                evaluate("document.querySelector('button[aria-label=\"Mở menu tài khoản\"]').click()")
                evaluate("document.querySelector('[role=menu][aria-label=\"Tài khoản cá nhân\"] button').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] input#new-password'))")
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'personal-password-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
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
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Nhập Excel').click()")
                wait_for("Boolean(document.querySelector('[data-excel-import]'))")
                if not evaluate("Boolean(document.querySelector('[role=dialog] [data-excel-import]'))"):
                    raise RuntimeError('Excel import should open as a dialog')
                if evaluate("document.querySelector('[role=dialog]').getBoundingClientRect().width") > min(672,width):
                    raise RuntimeError('Initial Excel dialog should be compact')
                if not evaluate("document.querySelector('[data-excel-import] a[download]')?.getAttribute('href')==='/mau-import-cong-viec.xlsx' && document.querySelector('[data-excel-import] details').open===false"):
                    raise RuntimeError('Excel template or optional help is missing')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'excel-select-{width}.png').write_bytes(base64.b64decode(image['data']))
                root=command('DOM.getDocument')['root']['nodeId']
                file_node=command('DOM.querySelector', {'nodeId':root,'selector':'[data-excel-import] input[type=file]'})['nodeId']
                command('DOM.setFileInputFiles', {'nodeId':file_node,'files':[request['importFile']]})
                wait_for("!document.querySelector('[data-excel-import]') && Boolean(document.querySelector('.task-list-table'))")
                evaluate("window.__excelCount=null;fetch('/api/tasks?search='+encodeURIComponent('Excel UI ')).then(r=>r.json()).then(rows=>window.__excelCount=rows.length)")
                wait_for("window.__excelCount===1")
                if evaluate("Boolean(document.querySelector('.swal2-close'))"):
                    evaluate("document.querySelector('.swal2-close').click()")
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Nhập Excel').click()")
                wait_for("Boolean(document.querySelector('[data-excel-import]'))")
                root=command('DOM.getDocument')['root']['nodeId']
                file_node=command('DOM.querySelector', {'nodeId':root,'selector':'[data-excel-import] input[type=file]'})['nodeId']
                command('DOM.setFileInputFiles', {'nodeId':file_node,'files':[request['importReviewFiles'][str(width)]]})
                wait_for("document.querySelectorAll('[data-excel-import] tbody tr').length===1 && !document.querySelector('[data-excel-import] footer button').disabled")
                wait_for("document.querySelector('[data-excel-import] [role=alert]')?.innerText.includes('UI!2')")
                evaluate("window.__reviewCount=null;fetch('/api/tasks?search='+encodeURIComponent('Excel review "+str(width)+" ')).then(r=>r.json()).then(rows=>window.__reviewCount=rows.length)")
                wait_for("window.__reviewCount===0")
                if evaluate("[...document.querySelectorAll('[data-excel-import] footer button')].some(b=>/Xem trước|Kiểm tra lại|Nhập công việc/.test(b.innerText))"):
                    raise RuntimeError('Manual preview/import controls should be removed')
                if evaluate("document.documentElement.scrollWidth>innerWidth"):
                    raise RuntimeError('Excel preview causes horizontal page overflow')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'excel-preview-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("[...document.querySelectorAll('[data-excel-import] label')].find(l=>l.innerText.includes('Cho phép dòng')).querySelector('input').click()")
                evaluate("document.querySelector('[data-excel-import] tbody td label input[type=checkbox]').click()")
                wait_for("!document.querySelector('[data-excel-import]') && Boolean(document.querySelector('.task-list-table'))")
                evaluate("window.__reviewCount=null;fetch('/api/tasks?search='+encodeURIComponent('Excel review "+str(width)+" ')).then(r=>r.json()).then(rows=>window.__reviewCount=rows.length)")
                wait_for("window.__reviewCount===1")
                if evaluate("Boolean(document.querySelector('.swal2-close'))"):
                    evaluate("document.querySelector('.swal2-close').click()")
                if evaluate("[...document.querySelectorAll('.task-list-table th')].map(th=>th.innerText)") != ['Công việc','Hạn','Thao tác']:
                    raise RuntimeError('Task list still shows removed columns')
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Thêm công việc').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] textarea[maxlength=\"500\"]'))")
                if not evaluate("(() => {const s=getComputedStyle(document.querySelector('[role=dialog] textarea[maxlength=\"500\"]'));return parseFloat(s.borderTopWidth)>=1 && parseFloat(s.paddingLeft)>=8;})()"):
                    raise RuntimeError('Work input has lost its border or padding')
                task_title = f'UI multiline {width}\n- First item\n- Second item'
                task_description = '- Gather documents\n- Verify figures'
                evaluate("document.querySelector('[role=dialog] textarea[maxlength=\"500\"]').focus()")
                command('Input.insertText', {'text':task_title})
                evaluate("document.querySelector('[role=dialog] textarea[rows=\"6\"]').focus()")
                command('Input.insertText', {'text':task_description})
                if evaluate("document.querySelector('[role=dialog] select[aria-label=\"Ph\u00f2ng ban c\u00f4ng vi\u1ec7c\"]').required"):
                    raise RuntimeError('Admin should not be required to select a department')
                if width == 390:
                    chosen_department = ''
                else:
                    chosen_department = evaluate("(()=>{const select=document.querySelector('[role=dialog] select[aria-label=\"Phòng ban công việc\"]');select.value=[...select.options].find(o=>o.value).value;select.dispatchEvent(new Event('change',{bubbles:true}));return select.value})()")
                if evaluate("[...document.querySelectorAll('[role=dialog] label')].some(l=>l.innerText.startsWith('Ưu tiên'))"):
                    raise RuntimeError('Priority remains in the work form')
                if width >= 1024 and evaluate("document.querySelector('[role=dialog]').getBoundingClientRect().width") < 1100:
                    raise RuntimeError('Work form is too narrow on desktop')
                picker_selector = '[role=dialog] input[type=date][aria-label="Chọn ngày: Hạn chót"]'
                evaluate("document.querySelector("+json.dumps(picker_selector)+").parentElement.parentElement.querySelector('input[type=text]').focus()")
                command('Input.insertText', {'text':'31/02/2026'})
                picker_bounds=evaluate("(()=>{const input=document.querySelector("+json.dumps(picker_selector)+");const original=input.showPicker;input.showPicker=function(){const result=original.call(this);window.__calendarOpened=true;return result};input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                command('Input.dispatchMouseEvent', {'type':'mousePressed','x':picker_bounds['x'],'y':picker_bounds['y'],'button':'left','clickCount':1})
                command('Input.dispatchMouseEvent', {'type':'mouseReleased','x':picker_bounds['x'],'y':picker_bounds['y'],'button':'left','clickCount':1})
                wait_for("window.__calendarOpened===true")
                command('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                command('Input.dispatchKeyEvent', {'type':'keyUp','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                wait_for("Boolean(document.querySelector('[role=dialog]'))")
                evaluate("(()=>{const input=document.querySelector("+json.dumps(picker_selector)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-12-31');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()")
                wait_for("(()=>{const input=document.querySelector("+json.dumps(picker_selector)+").parentElement.parentElement.querySelector('input[type=text]');return input.value==='31/12/2026'&&input.validity.valid})()")
                evaluate("document.querySelector('[role=dialog] button[type=submit]').click()")
                wait_for("!document.querySelector('[role=dialog] button[type=submit]')")
                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='Chi tiết').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] textarea[maxlength=\"500\"]'))")
                if evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l=>l.innerText.startsWith('Phòng ban')).querySelector('select').value") != chosen_department:
                    raise RuntimeError('Chosen task department was overwritten by admin account department')
                if evaluate("document.querySelector('[role=dialog] textarea[maxlength=\"500\"]').value") != task_title or evaluate("document.querySelector('[role=dialog] textarea[rows=\"6\"]').value") != task_description:
                    raise RuntimeError('Multiline work content changed after saving')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'task-wide-form-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
                wait_for("!document.querySelector('[role=dialog]')")
                evaluate("document.querySelector('input[aria-label=\"Tìm công việc\"]').focus()")
                command('Input.insertText', {'text':f'UI multiline {width}'})
                time.sleep(0.6)
                wait_for("[...document.querySelectorAll('.task-list-table tbody p')].some(p=>p.textContent==="+json.dumps(task_description)+" && getComputedStyle(p).whiteSpace==='pre-wrap')")
                wait_for("document.querySelectorAll('.task-list-table tbody tr[data-task-id]').length===1")
                if not evaluate("(()=>{const buttons=[...document.querySelector('tr[data-task-id]').querySelectorAll('td:last-child button')];return buttons.length===2&&Math.abs(buttons[0].getBoundingClientRect().top-buttons[1].getBoundingClientRect().top)<1})()"):
                    raise AssertionError('Task edit/delete buttons must share one row')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'task-multiline-table-{width}.png').write_bytes(base64.b64decode(image['data']))
                linked_task=evaluate("document.querySelector('.task-list-table tbody tr[data-task-id]').dataset.taskId")
                if evaluate("Boolean(document.querySelector('.app-main a[href*=\"/bao-cao\"]'))"):
                    raise RuntimeError('Reporting link remains in the task list')
                if width<1024:
                    evaluate("document.querySelector('button[aria-label=\"M\u1edf menu\"]').click()")
                evaluate("document.querySelector('#app-sidebar a[href=\"/bao-cao\"]').click()")
                wait_for("location.pathname==='/bao-cao' && Boolean(document.querySelector('.app-main')) && [...document.querySelectorAll('.app-main button')].some(b=>b.innerText.trim()==='Lập báo cáo'&&!b.disabled)")
                if evaluate("Boolean(document.querySelector('[role=dialog]'))"):
                    raise RuntimeError('Task report link should open the reports page, not auto-open a form')
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Lập báo cáo').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] input[type=checkbox]'))")
                evaluate("document.querySelector('[role=dialog] input[required]').focus()")
                command('Input.insertText', {'text':f'Weekly report UI {width}'})
                evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l=>l.querySelector('input[type=checkbox]')&&l.innerText.trim().startsWith('#"+linked_task+" ')).querySelector('input').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] section h4'))")
                if not evaluate("[...document.querySelectorAll('[role=dialog] input[type=checkbox]')].filter(i=>i.checked).length===1"):
                    raise RuntimeError('Report did not preselect the linked task')
                wait_for("[...document.querySelectorAll('[role=dialog] label')].some(l=>l.innerText.trim()==='Ti\u1ebfn \u0111\u1ed9'&&l.querySelector('textarea'))")
                evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l=>l.innerText.trim()==='Ti\u1ebfn \u0111\u1ed9').querySelector('textarea').focus()")
                command('Input.insertText',{'text':f'Linked report update {width}'})
                for field_label,field_value in [('V\u01b0\u1edbng m\u1eafc',f'Blocker {width}'),('Gi\u1ea3i ph\u00e1p',f'Solution {width}')]:
                    evaluate("[...document.querySelectorAll('[role=dialog] label')].find(l=>l.innerText.trim()==="+json.dumps(field_label)+").querySelector('textarea').focus()")
                    command('Input.insertText',{'text':field_value})

                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='L\u01b0u c\u1eadp nh\u1eadt c\u00f4ng vi\u1ec7c').click()")
                wait_for("[...document.querySelectorAll('[role=dialog] button')].some(b=>b.innerText.trim()==='L\u01b0u c\u1eadp nh\u1eadt c\u00f4ng vi\u1ec7c'&&!b.disabled)")
                evaluate("fetch('/api/tasks/"+linked_task+"').then(r=>r.json()).then(t=>window.__savedLinkedProgress=t.progress_text)")
                wait_for("window.__savedLinkedProgress==="+json.dumps(f'Linked report update {width}'))
                evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='L\u01b0u nh\u00e1p').click()")
                wait_for("!document.querySelector('[role=dialog]')")
                wait_for("Boolean(document.querySelector('.report-list-table')) && document.querySelector('.report-list-table').innerText.includes("+json.dumps(f'Linked report update {width}')+") && document.querySelector('.report-list-table').innerText.includes("+json.dumps(f'Blocker {width}')+") && document.querySelector('.report-list-table').innerText.includes("+json.dumps(f'Solution {width}')+")")
                if not evaluate("['Ti\u1ebfn \u0111\u1ed9','H\u1ea1n','V\u01b0\u1edbng m\u1eafc','Gi\u1ea3i ph\u00e1p'].every(label=>[...document.querySelectorAll('.report-list-table th')].some(th=>th.innerText===label))"):
                    raise RuntimeError('Missing progress/deadline/blocker/solution report column')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'report-progress-fields-{width}.png').write_bytes(base64.b64decode(image['data']))
                evaluate("fetch('/api/tasks/"+linked_task+"').then(r=>r.json()).then(t=>window.__linkedProgress=t.progress_text)")
                wait_for("window.__linkedProgress==="+json.dumps(f'Linked report update {width}'))
                command('Page.navigate',{'url':base+'/timeline?search='+urllib.parse.quote(f'UI multiline {width}')})
                wait_for("Boolean(document.querySelector('.task-list-table tbody tr[data-task-id]'))")
                evaluate("document.querySelector('input[aria-label=\"T\u00ecm c\u00f4ng vi\u1ec7c\"]').focus()")
                command('Input.insertText',{'text':f'UI multiline {width}'})
                time.sleep(0.6)
                wait_for("document.querySelectorAll('.task-list-table tbody tr[data-task-id]').length===1")
                if evaluate("Boolean(document.querySelector('.swal2-close'))"):
                    evaluate("document.querySelector('.swal2-close').click()")
                evaluate("[...document.querySelectorAll('.task-list-table tbody tr[data-task-id] button')].find(b=>b.innerText.trim()==='Sửa').click()")
                wait_for("Boolean(document.querySelector('[role=dialog] textarea[maxlength=\"500\"]'))")
                if evaluate("document.querySelector('[role=dialog] textarea[maxlength=\"500\"]').value") != task_title:
                    raise RuntimeError('Row edit opened the wrong work item')
                evaluate("document.querySelector('[role=dialog] button[aria-label=\"Đóng hộp thoại\"]').click()")
                wait_for("!document.querySelector('[role=dialog]')")
                evaluate("[...document.querySelectorAll('.task-list-table tbody tr[data-task-id] button')].find(b=>b.innerText.trim()==='Xóa').click()")
                wait_for("Boolean(document.querySelector('.swal2-textarea'))")
                evaluate("document.querySelector('.swal2-textarea').focus()")
                command('Input.insertText', {'text':'Delete disposable row from work list'})
                evaluate("document.querySelector('.swal2-confirm').click()")
                wait_for("Boolean(document.querySelector('.swal2-toast.swal2-icon-success'))")
                evaluate("window.__deletedRowCount=null;fetch('/api/tasks?deleted=1&search='+encodeURIComponent("+json.dumps(f'UI multiline {width}')+")).then(r=>r.json()).then(rows=>window.__deletedRowCount=rows.length)")
                wait_for("window.__deletedRowCount===1")
                evaluate("[...document.querySelectorAll('.app-main button')].find(b=>b.innerText.trim()==='Xóa bộ lọc').click()")
                wait_for("document.querySelectorAll('.task-list-table tbody tr[data-task-id]').length>100")
                if not evaluate("(()=>{const groups=[...document.querySelectorAll('.task-list-table tbody[data-task-assignee]')];return groups.length>1&&new Set(groups.map(g=>g.dataset.taskAssignee)).size===groups.length&&groups.every(g=>{const headings=g.querySelectorAll('.task-group-heading');return headings.length===1&&headings[0].querySelector('td').colSpan===3&&g.querySelectorAll('tr[data-task-id]').length>0})})()"):
                    raise AssertionError('Task owners must appear once with all their work grouped')
                image=command('Page.captureScreenshot', {'format':'png'})
                (output / f'task-grouped-{width}.png').write_bytes(base64.b64decode(image['data']))
                if evaluate("Boolean(document.querySelector('.swal2-close'))"):
                    evaluate("document.querySelector('.swal2-close').click()")
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
                if evaluate("Boolean(document.querySelector('.app-main nav[aria-label=\"Ph\u00e2n trang\"]'))"):
                    raise RuntimeError('Task list still has pagination')
                if evaluate("document.querySelectorAll('.task-list-table tbody tr[data-task-id]').length") <= 100:
                    raise RuntimeError('Task list did not load all matching work')
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
                wait_for("Boolean(document.querySelector('.dashboard-overview'))")
                overview_height=evaluate("document.querySelector('.dashboard-overview').getBoundingClientRect().height")
                if overview_height > (1000 if width < 768 else 600):
                    raise RuntimeError(f'Dashboard overview is too tall: {overview_height}')
                if not evaluate("document.querySelector('[data-dashboard-reports]')?.open===false"):
                    raise RuntimeError('Recent reports should start collapsed')
                if evaluate("document.querySelectorAll('.dashboard-overview section > a').length") > 6:
                    raise RuntimeError('Dashboard previews should be limited to three rows each')
                evaluate("document.querySelector('[data-dashboard-reports] summary').click()")
                wait_for("document.querySelector('[data-dashboard-reports]').open")
                evaluate("document.querySelector('[data-dashboard-reports] summary').click()")
                wait_for("!document.querySelector('[data-dashboard-reports]').open")
                if phase == 'after' and width >= 1024:
                    group_button = "document.querySelector('#app-sidebar section[aria-label=' + JSON.stringify('Nhân sự') + '] > button')"
                    if evaluate(group_button + ".getAttribute('aria-expanded')") != 'false':
                        raise RuntimeError('Personnel menu should start collapsed on dashboard')
                    evaluate(group_button + '.click()')
                    wait_for(group_button + ".getAttribute('aria-expanded')==='true' && Boolean(document.querySelector('#app-sidebar a[href=\"/nhan-vien\"]'))")
                    evaluate(group_button + '.click()')
                    wait_for(group_button + ".getAttribute('aria-expanded')==='false'")
                if phase == 'after':
                    evaluate("document.querySelector('.app-header button[aria-expanded]:not([aria-controls])').click()")
                    wait_for("Boolean(document.querySelector('.app-header [role=region]'))")
                    bounds = evaluate("(() => {const r=document.querySelector('.app-header [role=region]').getBoundingClientRect();return {left:r.left,right:r.right};})()")
                    if bounds['left'] < 0 or bounds['right'] > width:
                        raise RuntimeError('Notification panel is outside the viewport')
                    image=command('Page.captureScreenshot', {'format':'png'})
                    (output / f'notifications-{width}.png').write_bytes(base64.b64decode(image['data']))
                    evaluate("document.querySelector('.app-main').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))")
                    wait_for("!document.querySelector('.app-header [role=region]')")
                if width < 768:
                    evaluate("document.querySelector('button[aria-label=\"Mở menu\"]').click()")
                    time.sleep(0.3)
                    menu = evaluate("(() => {const r=document.getElementById('app-sidebar').getBoundingClientRect();return {left:r.left,right:r.right}})()")
                    if menu['left'] < -1 or menu['right'] > width:
                        raise RuntimeError('Mobile sidebar outside viewport')
                    if phase == 'after':
                        if not evaluate("document.body.style.overflow==='hidden' && document.querySelector('.app-main').closest('[inert]')!==null && document.getElementById('app-sidebar').contains(document.activeElement)"):
                            raise RuntimeError('Mobile drawer failed scroll lock or keyboard focus')
                    evaluate("document.getElementById('app-sidebar').querySelector('button[aria-controls=\"app-sidebar\"]').click()")
                    if phase == 'after':
                        wait_for("document.body.style.overflow!=='hidden' && !document.querySelector('.app-main').closest('[inert]')")
                elif evaluate("document.querySelector('button[aria-label=\"Mở menu\"]').getBoundingClientRect().width") != 0:
                    raise RuntimeError('Duplicate sidebar toggle on desktop')
                elif phase == 'after':
                    evaluate("document.querySelector('.app-header input').focus()")
                    command('Input.insertText', {'text':'công'})
                    wait_for("Boolean(document.querySelector('.app-header input[aria-controls]'))")
                    command('Input.dispatchKeyEvent', {'type':'keyDown','key':'ArrowDown','code':'ArrowDown','windowsVirtualKeyCode':40})
                    if not evaluate("document.activeElement.tagName==='A' && document.querySelector('.app-header').contains(document.activeElement)"):
                        raise RuntimeError('Navigation search is not keyboard accessible')
                    command('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                    wait_for("document.querySelector('.app-header input').value==='' && document.activeElement===document.querySelector('.app-header input')")
    (output / 'layout-metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS: desktop/mobile pages and available forms. No document horizontal overflow or cards/forms outside viewport. Screenshots: .next-verify/ui-review/{phase}/')
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
