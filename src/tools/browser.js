'use strict';

const { getConfig } = require('../config');

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtml(html) {
  const pick = (regex, index = 1, limit = 30) => {
    const out = [];
    for (const match of html.matchAll(regex)) {
      if (out.length >= limit) break;
      const value = match[index];
      if (value && !out.includes(value)) out.push(value);
    }
    return out;
  };

  return {
    title: stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''),
    description: stripTags((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || ''),
    scripts: pick(/<script[^>]+src=["']([^"']+)["']/gi),
    styles: pick(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi),
    forms: pick(/<form[^>]+action=["']([^"']*)["']/gi),
    links: pick(/<a[^>]+href=["']([^"']+)["']/gi, 1, 25),
    headings: pick(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 1, 15).map(stripTags),
    inlineScripts: pick(/<script(?![^>]+src)[^>]*>([\s\S]{1,1200}?)<\/script>/gi, 1, 4).map((s) => s.trim().slice(0, 600))
  };
}

async function observeUrl(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'clone-anything-workbench/1.0' },
    signal: AbortSignal.timeout(12000)
  });
  const html = await response.text();
  return {
    kind: 'http',
    url,
    status: response.status,
    length: html.length,
    ...parseHtml(html)
  };
}

async function observeCdp(cdpUrl, url) {
  if (typeof WebSocket !== 'function') throw new Error('WebSocket API unavailable');
  const base = String(cdpUrl || '').replace(/\/$/, '');
  const listResponse = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(5000) });
  const pages = await listResponse.json();
  const page = pages.find((item) => item.type === 'page') || pages[0];
  if (!page || !page.webSocketDebuggerUrl) throw new Error('No CDP page target available');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connect timeout')), 6000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (event) => { clearTimeout(timer); reject(new Error('CDP socket error')); };
  });

  let nextId = 0;
  const pending = new Map();
  let resolveLoad;
  const loaded = new Promise((resolve) => { resolveLoad = resolve; });

  socket.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch (err) { return; }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || 'CDP error'));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Page.loadEventFired') resolveLoad();
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 10000);
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 9000))]);
  const evaluation = await send('Runtime.evaluate', {
    expression: 'document.documentElement.outerHTML',
    returnByValue: true
  });
  socket.close();
  const html = evaluation?.result?.value || '';
  return {
    kind: 'cdp',
    url,
    status: 200,
    length: html.length,
    ...parseHtml(html)
  };
}

async function observe(target) {
  const cfg = getConfig();
  try {
    const result = await observeCdp(cfg.browser.cdpUrl, target);
    return { ...result, tool: 'Chrome DevTools Protocol' };
  } catch (cdpError) {
    const result = await observeUrl(target);
    return { ...result, tool: 'Built-in HTTP browser', fallbackReason: cdpError.message };
  }
}

module.exports = { observe, observeUrl, observeCdp, parseHtml };
