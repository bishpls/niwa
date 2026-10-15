// engine/scene3d/panel.js: the operator panel's kit (the sandbox's, and projects/charstudio's): a fixed panel of
// collapsible sections with sliders, toggles, selects and buttons, a help line that flashes messages, and refresh()
// that puts every control back in step with what it reads. No backdrop blur (re-blurring a canvas that changes every
// frame cost ~10 ms a frame at 1600x900).
//
//   const K = makePanel({ id: 'nw', help: 'drag orbit · ...', css: '#nw{width:300px}' })
//   const s = K.sec('time', true); K.slider(s, 'hour', 4.5, 23.5, 0.01, get, set, fmt); K.toggle(K.row(s), 'play', get, set)
//   K.flash('copied', 4000); K.refresh()
// Ids: #ID the panel, #IDhelp the help line, #IDi and #IDa two cards on the right (the sandbox's selection and actor).
export function panelCSS(id) {
  const i = '#' + id;
  return `${i}{position:fixed;left:10px;top:10px;width:300px;max-height:calc(100vh - 20px);overflow:auto;background:rgba(18,16,22,.9);
    color:#e8e2d6;padding:8px 12px 10px;border-radius:8px;font:12px ui-monospace,Menlo,monospace;user-select:none}
    ${i} details{border-top:1px solid #3a3342;padding:3px 0}${i} summary{cursor:pointer;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#d9a77f;padding:3px 0}
    ${i} label.s{display:grid;grid-template-columns:100px 1fr 46px;align-items:center;gap:6px;margin:2px 0}
    ${i} input[type=range]{width:100%}${i} .row{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0;align-items:center}
    ${i} button,${i}i button,${i}a button{background:#2c2733;color:#e8e2d6;border:1px solid #4a4255;border-radius:4px;padding:3px 6px;font:inherit;cursor:pointer}
    ${i} button.on{background:#7a4a3a;border-color:#c07a5a}${i} .st{color:#b8b0a4;white-space:pre;line-height:1.35}
    ${i} select,${i} input[type=text],${i} textarea{background:#2c2733;color:#e8e2d6;border:1px solid #4a4255;font:inherit;max-width:100%}
    ${i} textarea{width:100%;box-sizing:border-box}${i} .dim{color:#988f84}${i} .li{display:flex;gap:4px;align-items:center;margin:1px 0}
    ${i} .li span.n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}${i} .sw{width:9px;height:9px;border-radius:2px;display:inline-block}
    ${i} .find{cursor:pointer;padding:2px 3px;border-radius:3px}${i} .find:hover{background:#3a3342}
    ${i}help{position:fixed;right:10px;bottom:10px;color:#cfc6b8;font:11px ui-monospace,monospace;background:rgba(18,16,22,.6);padding:6px 9px;border-radius:6px;max-width:60vw}
    ${i}i,${i}a{position:fixed;right:10px;width:300px;background:rgba(18,16,22,.84);color:#e8e2d6;padding:8px 10px;border-radius:8px;
    font:11.5px ui-monospace,Menlo,monospace;white-space:pre-wrap;line-height:1.4;display:none}${i}i b{color:#ffc440}${i}a b{color:#78c4ff}`;
}

export function makePanel({ id = 'nw', help: HELP = '', css: extra = '' } = {}) {
  const css = document.createElement('style');
  css.textContent = panelCSS(id) + extra;
  document.head.appendChild(css);
  const P = document.createElement('div'); P.id = id; document.body.appendChild(P);
  const help = document.createElement('div'); help.id = id + 'help';
  help.textContent = HELP; document.body.appendChild(help);
  const K = { P, help, HELP, REFRESH: [] };
  K.flash = (t, ms = 4000) => { help.textContent = t; clearTimeout(K.flash.h); K.flash.h = setTimeout(() => { help.textContent = K.HELP; }, ms); };
  K.refresh = () => K.REFRESH.forEach(f => f());
  const el = K.el = (tag, parent, props = {}) => { const e = document.createElement(tag); Object.assign(e, props); parent && parent.appendChild(e); return e; };
  K.sec = (title, open = false, parent = P) => { const d = el('details', parent); d.open = open; el('summary', d, { textContent: title }); return d; };
  K.row = parent => el('div', parent, { className: 'row' });
  K.slider = (parent, name, min, max, step, get, set, f = v => (+v).toFixed(2)) => {
    const l = el('label', parent, { className: 's', innerHTML: `<span>${name}</span><input type=range min=${min} max=${max} step=${step}><span></span>` });
    const inp = l.querySelector('input'), out = l.querySelectorAll('span')[1];
    const upd = () => { const v = get(); inp.value = v; out.textContent = f(v); };
    inp.oninput = () => { set(+inp.value); out.textContent = f(+inp.value); };
    upd(); K.REFRESH.push(upd); return inp;
  };
  K.button = (parent, text, fn, title = '') => { const b = el('button', parent, { textContent: text, title }); b.onclick = fn; return b; };
  K.toggle = (parent, name, get, set, title = '') => {
    const b = el('button', parent, { textContent: name, title }); const upd = () => b.classList.toggle('on', !!get());
    b.onclick = () => { set(!get()); upd(); }; upd(); K.REFRESH.push(upd); return b;
  };
  K.select = (parent, label, opts, get, set) => {
    const s = el('select', parent, { title: label });
    const fill = list => { s.innerHTML = ''; list.forEach(([n, v]) => el('option', s, { value: v, textContent: n })); s.value = get(); };
    fill(opts); s.onchange = () => set(s.value); K.REFRESH.push(() => { s.value = get(); }); s.fill = fill; return s;
  };
  return K;
}
