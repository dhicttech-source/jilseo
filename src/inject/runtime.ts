/**
 * 서비스 패널 안에서 실행되는 JS 문자열 빌더.
 * - 동기 표현식만 가능 (wry eval은 Promise를 기다리지 않음)
 * - 항상 JSON 문자열을 반환 → evalInPanel이 파싱
 * - 셀렉터는 콤마 구분 목록 허용 (querySelector가 첫 매치 반환)
 */

import { TODO_SELECTOR_PREFIX } from "../adapters";

const q = (sel: string) => `document.querySelector(${JSON.stringify(sel)})`;

/** 셀렉터 존재·가시성 진단 */
export const probeJs = (selectors: Record<string, string | undefined>) => `(() => {
  const out = {};
  const sels = ${JSON.stringify(selectors)};
  const TODO = ${JSON.stringify(TODO_SELECTOR_PREFIX)};
  for (const k in sels) {
    if (!sels[k]) continue;
    if (String(sels[k]).startsWith(TODO)) { out[k] = { found: false, todo: true }; continue; }
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
    document.execCommand('insertText', false, t);
    const now = (el.innerText || '').trim();
    if (!now.includes(t.slice(0, 20))) {
      // Lexical 계열 에디터(Perplexity)는 execCommand를 무시 → paste 이벤트로 삽입.
      // 반영이 비동기라 여기서는 확인하지 않고 pending으로 알린다 (앱이 잠시 뒤 readInputJs로 확인).
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', t);
        el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        return JSON.stringify({ ok: true, method: 'paste', pending: true });
      } catch (e) {
        return JSON.stringify({ ok: false, reason: 'insertText and paste failed: ' + String(e) });
      }
    }
  }
  const now = (el.value !== undefined ? el.value : el.innerText || '').trim();
  return JSON.stringify({ ok: now.length > 0, method: 'execCommand', now: now.slice(0, 80) });
})()`;

/**
 * contenteditable에 DOM 직접 삽입 (줄마다 <p>). execCommand와 paste를 모두 무시하는 상태의 에디터(Gemini/Quill: 응답 뒤 포커스가 빠진 경우)용.
 * innerHTML 대입은 쓰지 않는다 — Google 사이트는 Trusted Types로 막아 페이지 오류가 난다.
 */
export const insertDomJs = (inputSel: string, text: string) => `(() => {
  const el = ${q(inputSel)};
  if (!el) return JSON.stringify({ ok: false, reason: 'input not found: ' + ${JSON.stringify(inputSel)} });
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return JSON.stringify({ ok: false, reason: 'not contenteditable' });
  el.focus();
  const t = ${JSON.stringify(text)};
  while (el.firstChild) el.removeChild(el.firstChild);
  for (const line of t.split('\\n')) {
    const p = document.createElement('p');
    p.appendChild(line ? document.createTextNode(line) : document.createElement('br'));
    el.appendChild(p);
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
  const now = (el.innerText || '').trim();
  return JSON.stringify({ ok: now.includes(t.slice(0, 20)), method: 'dom', now: now.slice(0, 80) });
})()`;

/** 전송 버튼이 있고 활성이면 클릭. 비활성이면 { ok:false, reason:'disabled' } (앱이 재시도) */
export const clickSendJs = (sendSel: string) => `(() => {
  const btn = ${q(sendSel)};
  if (!btn) return JSON.stringify({ ok: false, reason: 'missing' });
  const enabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && (btn.offsetWidth || btn.offsetHeight);
  if (!enabled) return JSON.stringify({ ok: false, reason: 'disabled' });
  btn.click();
  return JSON.stringify({ ok: true, method: 'click' });
})()`;

/** 전송: 버튼 클릭 우선, 버튼이 없거나 비활성이면 입력창에 Enter (단발 시도용) */
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
/**
 * 마지막 응답 컨테이너 고르기 (sel, els 가 정의된 문맥에 삽입되는 식):
 * - 뒤에서부터 텍스트가 비어 있지 않은 첫 요소 (Gemini는 끝에 빈 message-content가 붙는다)
 * - 그 요소를 포함하는 가장 바깥 매칭 요소 (Claude는 스트리밍 중 내부 조각도 셀렉터에 걸려 1글자만 읽힌다)
 */
const LAST_RESPONSE_EL = `(() => {
    let el = null;
    for (let i = els.length - 1; i >= 0; i--) { if ((els[i].innerText || '').trim()) { el = els[i]; break; } }
    if (!el) el = els[els.length - 1] || null;
    while (el && el.parentElement) { const up = el.parentElement.closest(sel); if (!up) break; el = up; }
    return el;
  })()`;

/**
 * 마지막 응답 컨테이너의 텍스트. generatingSel이 주어지면 "생성 중" 표시(중지 버튼·스트리밍 속성)가 보이는지도 함께 돌려준다.
 * 검색·도구 호출로 몇 초씩 멈추는 구간을 "완료"로 오인하지 않기 위한 근거.
 */
export const readResponseJs = (responseSel: string, generatingSel?: string) => `(() => {
  const sel = ${JSON.stringify(responseSel)};
  const els = document.querySelectorAll(sel);
  const last = ${LAST_RESPONSE_EL};
  const text = last ? (last.innerText || '') : '';
  const g = ${generatingSel ? `document.querySelector(${JSON.stringify(generatingSel)})` : "null"};
  const generating = !!g && (g.offsetWidth > 0 || g.offsetHeight > 0 || g.tagName === 'DIV');
  return JSON.stringify({ count: els.length, length: text.length, text: text.slice(0, 20000), generating });
})()`;

/** 마지막 응답 컨테이너의 HTML (마크다운 변환용) */
export const readResponseHtmlJs = (responseSel: string) => `(() => {
  const sel = ${JSON.stringify(responseSel)};
  const els = document.querySelectorAll(sel);
  const last = ${LAST_RESPONSE_EL};
  return JSON.stringify({ count: els.length, html: last ? (last.outerHTML || '').slice(0, 400000) : '' });
})()`;

/**
 * 파일 첨부: base64 → File → DataTransfer.
 * 1) fileInput 셀렉터가 있으면 input.files 설정 + change 이벤트
 * 2) 없으면 입력창(또는 body)에 drop 이벤트, 실패 시 paste 이벤트
 */
export const attachFileJs = (
  fileInputSel: string | undefined,
  inputSel: string,
  file: { name: string; mime: string; data: string },
) => `(() => {
  const bin = atob(${JSON.stringify(file.data)});
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const f = new File([arr], ${JSON.stringify(file.name)}, { type: ${JSON.stringify(file.mime)} });
  const dt = new DataTransfer();
  dt.items.add(f);
  const input = ${fileInputSel ? `document.querySelector(${JSON.stringify(fileInputSel)})` : "null"};
  if (input && input.tagName === 'INPUT') {
    try {
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ ok: true, method: 'input', size: f.size });
    } catch (e) { /* fall through */ }
  }
  const target = ${q(inputSel)} || document.body;
  try {
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      target.dispatchEvent(ev);
    }
    return JSON.stringify({ ok: true, method: 'drop', size: f.size });
  } catch (e) {
    try {
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
      target.dispatchEvent(ev);
      return JSON.stringify({ ok: true, method: 'paste', size: f.size });
    } catch (e2) {
      return JSON.stringify({ ok: false, reason: 'drop/paste unsupported: ' + String(e2) });
    }
  }
})()`;


/** 요소 클릭 (메뉴 열기 등) */
export const clickJs = (sel: string) => `(() => {
  const el = ${q(sel)};
  if (!el) return JSON.stringify({ ok: false, reason: 'not found: ' + ${JSON.stringify(sel)} });
  el.click();
  return JSON.stringify({ ok: true });
})()`;

/** Escape 키 (열린 메뉴 닫기) */
export const escapeJs = () => `(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  return JSON.stringify({ ok: true });
})()`;


/** 입력창 현재 텍스트 읽기 (paste 삽입 확인용) */
export const readInputJs = (inputSel: string) => `(() => {
  const el = ${q(inputSel)};
  if (!el) return JSON.stringify({ text: '' });
  return JSON.stringify({ text: String(el.value !== undefined ? el.value : el.innerText || '').trim().slice(0, 200) });
})()`;


/** 전송 버튼이 속한 form을 requestSubmit (synthetic click을 무시하는 사이트용 폴백) */
export const requestSubmitJs = (sendSel: string) => `(() => {
  const btn = ${q(sendSel)};
  const form = btn ? btn.closest('form') : null;
  if (!form || typeof form.requestSubmit !== 'function') return JSON.stringify({ ok: false, reason: 'no form' });
  try { form.requestSubmit(btn); return JSON.stringify({ ok: true, method: 'requestSubmit' }); }
  catch (e) { return JSON.stringify({ ok: false, reason: String(e) }); }
})()`;
