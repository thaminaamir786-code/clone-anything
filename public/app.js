'use strict';

(function () {
  const byId = (id) => document.getElementById(id);
  let targets = [];
  let selected = null;
  let jobId = null;
  let timer = null;
  let lastEventCount = -1;
  let lastFileCount = -1;
  let activeFile = null;

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  }

  function status(text, kind) {
    const pill = byId('status-pill');
    pill.textContent = text;
    pill.className = 'pill ' + (kind || '');
  }

  async function loadStatus() {
    try {
      const s = await api('/api/status');
      byId('rea-badge').textContent = 'REA ' + s.rea.version;
      status(s.ai.configured ? ('Model: ' + s.ai.model) : 'Local evidence brain', s.ai.configured ? 'online' : '');
      byId('model-base').value = s.ai.baseUrl || '';
      byId('model-name').value = s.ai.model || 'hy4';
    } catch (err) {
      status('Offline', 'error');
    }
  }

  async function loadTools() {
    try {
      const data = await api('/api/tools');
      const tools = data.tools || [];
      byId('tool-count').textContent = tools.length + ' tools';
      byId('tool-list').innerHTML = tools.slice(0, 60).map((tool) =>
        '<div class="tool-item"><b>' + esc(tool.name) + '</b> - ' + esc(tool.description) + '</div>'
      ).join('');
    } catch (err) {
      byId('tool-count').textContent = 'unavailable';
    }
  }

  async function search() {
    const query = byId('search-input').value.trim();
    status('Searching...');
    try {
      const data = await api('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query })
      });
      targets = data.targets || [];
      selected = null;
      renderResults();
      status(targets.length + ' targets');
    } catch (err) {
      status('Search failed', 'error');
    }
  }

  function renderResults() {
    const box = byId('results');
    if (!targets.length) {
      box.innerHTML = '<div class="empty">No targets found.</div>';
      return;
    }
    box.innerHTML = targets.map((t, i) => {
      const active = selected && selected.path === t.path && selected.name === t.name;
      return '<button class="result ' + (active ? 'selected' : '') + '" data-i="' + i + '" type="button">' +
        '<div class="name">' + esc(t.name) + '</div>' +
        '<div class="meta"><span class="badge">' + esc(t.type) + '</span> ' + esc(t.description || '') + '</div></button>';
    }).join('');
    box.querySelectorAll('.result').forEach((button) => {
      button.addEventListener('click', () => {
        selected = targets[Number(button.dataset.i)];
        renderResults();
        byId('target-hint').textContent = 'Selected: ' + selected.name + '. REA will analyze this exact target.';
      });
    });
  }

  function reset() {
    lastEventCount = -1;
    lastFileCount = -1;
    activeFile = null;
    byId('timeline').innerHTML = '<div class="empty">Starting the REA job...</div>';
    byId('file-tree').innerHTML = '<div class="empty">Target files will appear here.</div>';
    byId('file-viewer').textContent = 'Select a target file to view its original source.';
    byId('panel-report').innerHTML = '<pre class="viewer">Running...</pre>';
    byId('panel-evidence').innerHTML = '<pre class="viewer">Running...</pre>';
    byId('preview-box').innerHTML = '<div class="empty">No preview available for this target.</div>';
    byId('file-count').textContent = '0 target files';
    byId('download-btn').disabled = true;
    byId('progress-bar').style.width = '0%';
  }

  async function analyze() {
    let target = selected;
    const typed = byId('search-input').value.trim();
    if (!target && typed) {
      const url = /^https?:\/\//i.test(typed);
      target = {
        name: url ? typed : (typed.split(/[\\/]/).pop() || typed),
        type: url ? 'url' : 'path',
        path: typed,
        description: 'Typed target'
      };
    }
    if (!target) { status('Select a target first', 'error'); return; }
    status('Starting REA...');
    try {
      const data = await api('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target,
          question: byId('question').value.trim()
        })
      });
      jobId = data.id;
      reset();
      if (timer) clearInterval(timer);
      await poll();
      timer = setInterval(poll, 800);
    } catch (err) {
      status('Start failed', 'error');
    }
  }

  function renderProgress(job) {
    const steps = job.steps || [];
    const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
    const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    byId('progress-bar').style.width = pct + '%';
    const current = steps.find((s) => s.status === 'running');
    byId('progress-label').textContent = current ? (pct + '% - ' + current.label) : (pct + '% - ' + job.status);
  }

  function renderTimeline(job) {
    const events = job.events || [];
    if (events.length === lastEventCount) return;
    lastEventCount = events.length;
    const box = byId('timeline');
    box.innerHTML = events.map((e) =>
      '<div class="event ' + esc(e.kind) + '">' +
      '<div class="title">' + esc(e.title) + '</div>' +
      '<div class="text">' + esc(e.text) + '</div>' +
      '<div class="time">' + esc((e.at || '').slice(11, 19)) + '</div></div>'
    ).join('');
    box.scrollTop = box.scrollHeight;
  }

  function renderReport(job) {
    byId('panel-report').innerHTML = '<pre class="viewer">' + esc(job.report || 'No report yet.') + '</pre>';
  }

  function renderEvidence(job) {
    let text = '';
    if (job.evidencePreview) {
      try { text = JSON.stringify(JSON.parse(job.evidencePreview), null, 2); }
      catch (err) { text = job.evidencePreview; }
    }
    if (job.rawOutput && !text) text = job.rawOutput;
    if (text.length > 200000) text = text.slice(0, 200000) + '\n... (truncated)';
    byId('panel-evidence').innerHTML = '<pre class="viewer">' + esc(text || 'No REA evidence yet.') + '</pre>';
  }

  function renderFiles(job) {
    const files = job.targetFiles || [];
    byId('download-btn').disabled = !job.downloadUrl;
    byId('file-count').textContent = files.length + ' target files';
    if (files.length === lastFileCount) return;
    lastFileCount = files.length;
    const tree = byId('file-tree');
    if (!files.length) {
      tree.innerHTML = '<div class="empty">No target files.</div>';
      return;
    }
    tree.innerHTML = files.map((f) =>
      '<button class="file-item" data-path="' + esc(f.path) + '" type="button">' + esc(f.path) + '</button>'
    ).join('');
    tree.querySelectorAll('.file-item').forEach((button) => {
      button.addEventListener('click', () => {
        activeFile = button.dataset.path;
        tree.querySelectorAll('.file-item').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        const found = files.find((f) => f.path === activeFile);
        byId('file-viewer').textContent = found ? found.content : '';
      });
    });
  }

  function renderPreview(job) {
    const box = byId('preview-box');
    const target = job.target || {};
    if (/^https?:\/\//i.test(target.path || '')) {
      box.innerHTML = '<iframe src="' + esc(target.path) + '" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>';
    } else if (target.path) {
      box.innerHTML = '<div class="empty">Local target: ' + esc(target.path) +
        '<br>Use the <b>Target files</b> tab to view original source.</div>';
    }
  }

  async function poll() {
    if (!jobId) return;
    try {
      const job = await api('/api/job/' + jobId);
      renderProgress(job);
      renderTimeline(job);
      renderReport(job);
      renderEvidence(job);
      renderFiles(job);
      renderPreview(job);
      if (job.status === 'done' || job.status === 'error') {
        if (timer) clearInterval(timer);
        timer = null;
        status(job.status === 'done' ? 'REA complete' : 'Error', job.status === 'done' ? 'online' : 'error');
      }
    } catch (err) {
      status('Poll failed', 'error');
    }
  }

  function openModal() { byId('model-modal').classList.remove('hidden'); }
  function closeModal() { byId('model-modal').classList.add('hidden'); }

  byId('search-btn').addEventListener('click', search);
  byId('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  byId('analyze-btn').addEventListener('click', analyze);
  byId('download-btn').addEventListener('click', () => { if (jobId) window.location.assign('/api/download/' + jobId); });
  byId('doctor-btn').addEventListener('click', async () => {
    try { window.alert(JSON.stringify(await api('/api/status'), null, 2)); }
    catch (err) { window.alert('Doctor failed: ' + err.message); }
  });
  byId('model-btn').addEventListener('click', openModal);
  byId('model-cancel').addEventListener('click', closeModal);
  byId('model-save').addEventListener('click', async () => {
    try {
      const saved = await api('/api/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl: byId('model-base').value,
          apiKey: byId('model-key').value,
          model: byId('model-name').value
        })
      });
      byId('model-key').value = '';
      closeModal();
      status(saved.baseUrl && saved.apiKey ? ('Model: ' + saved.model) : 'Local evidence brain', saved.baseUrl && saved.apiKey ? 'online' : '');
    } catch (err) {
      window.alert('Save failed: ' + err.message);
    }
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      byId('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  loadStatus();
  loadTools();
  search();
}());
