/**
 * 서비스 패널 안에서 실행되는 JS 문자열 빌더.
 * - 동기 표현식만 가능 (wry eval은 Promise를 기다리지 않음)
 * - 항상 JSON 문자열을 반환 → evalInPanel이 파싱
 * - 셀렉터는 콤마 구분 목록 허용 (querySelector가 첫 매치 반환)
 */

const q = (sel: string) => `document.querySelector(${JSON.stringify(sel)})`;

/** 셀렉터 존재·가시성 진단 */
export const probeJs = (selectors: Record<string, string | undefined>) => `(() => {
  const out = {};
  const sels = ${JSON.stringify(selectors)};
  for (const k in sels) {
    if (!sels[k]) continue;
    if (String(sels[k]).startsWith('TODO')) { out[k] = { found: false, todo: true }; continue; }
    let el = null;
    try { el = document.querySelector(sels[k]); } catch (e) { out[k] = { found: false, invalid: String(e) }; continue; }
    out[k] = el ? { found: true, tag: el.tagName.toLowerCase(), vis: !!(el.offsetWidth || el.offsetHeight) } : { found: false };
  }
  return JSON.stringify({ url: location.href, title: document.title, selectors: out });
})()`;

/** 입력창에 텍스트 삽입 (contenteditable → execCommand, textarea/input → value setter + input 이벤트) */
export const insertTextJs = (inputSel: string, text: string) => `(() => {
  const el = ${q(inputSel)};
  if (!el) return JSON.stringify({ ok: false, reason: 'input not found: ' + ${JSON.stringify(inputSel)} });
  el.focus();
  const t = ${JSON.stringify(text)};
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    setter && setter.set ? setter.set.call(el, t) : (el.value = t);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    document.execCommand('selectAll', false);
    const ok = document.execCommand('insertText', false, t);
    if (!ok || !(el.innerText || '').trim()) {
      // execCommand 실패 시 InputEvent 폴백
      el.textContent = t;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
    }
  }
  const now = (el.value !== undefined ? el.value : el.innerText || '').trim();
  return JSON.stringify({ ok: now.length > 0, now: now.slice(0, 80) });
})()`;

/** 전송: 버튼 클릭 우선, 버튼이 없거나 비활성이면 입력창에 Enter */
export const submitJs = (sendSel: string, inputSel: string) => `(() => {
  const btn = ${q(sendSel)};
  const enabled = btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && (btn.offsetWidth || btn.offsetHeight);
  if (enabled) { btn.click(); return JSON.stringify({ ok: true, method: 'click' }); }
  const el = ${q(inputSel)};
  if (!el) return JSON.stringify({ ok: false, reason: 'neither send button nor input found' });
  el.focus();
  for (const type of ['keydown', 'keypress', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  return JSON.stringify({ ok: true, method: 'enter', note: btn ? 'button disabled' : 'button missing' });
})()`;

/** 입력창 비우기 */
export const clearInputJs = (inputSel: string) => `(() => {
  const el = ${q(inputSel)};
  if (!el) return JSON.stringify({ ok: false });
  el.focus();
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    setter && setter.set ? setter.set.call(el, '') : (el.value = '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  }
  return JSON.stringify({ ok: true });
})()`;

/** 마지막 응답 컨테이너의 텍스트 스냅샷 (완료 판정은 앱 쪽 폴링: 3초간 변화 없음) */
export const readResponseJs = (responseSel: string) => `(() => {
  const els = document.querySelectorAll(${JSON.stringify(responseSel)});
  const last = els[els.length - 1];
  const text = last ? (last.innerText || '') : '';
  return JSON.stringify({ count: els.length, length: text.length, text: text.slice(0, 20000) });
})()`;
