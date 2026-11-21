'use strict';

(function () {
  const byId = (id) => document.getElementById(id);
  let currentTargets = [];
  let selectedTarget = null;
  let jobId = null;
  let pollTimer = null;
  let lastEventCount = -1;
  let lastFileCount = -1;
  let activeFile = null;

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  }

  function setStatus(text, kind) {
    const pill = byId('status-pill');
    pill.textContent = text;
    pill.className = 'pill ' + (kind || '');
  }

  async function loadStatus() {
    try {
      const status = await api('/api/status');
      setStatus(status.ai.configured ? ('AI: ' + status.ai.model) : 'Local brain ready', status.ai.configured ? 'online' : '');
    } catch (err) {
      setStatus('Offline', 'error');
    }
  }

  async function search() {
    const query = byId('search-input').value.trim();
    setStatus('Searching...');
    try {
      const data = await api('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query })
      });
      currentTargets = data.targets || [];
      selectedTarget = null;
      renderResults();
      setStatus(currentTargets.length + ' targets found');
      byId('analyze-btn').disabled = currentTargets.length === 0;
    } catch (err) {
      setStatus('Search failed', 'error');
    }
  }

  function renderResults() {
    const box = byId('results');
    if (!currentTargets.length) {
      box.innerHTML = '<div class="empty">No targets found.</div>';
      return;
    }
    box.innerHTML = currentTargets.map((target, index) => {
      const active = selectedTarget && selectedTarget.path === target.path && selectedTarget.name === target.name;
      return '<button class="result ' + (active ? 'selected' : '') + '" data-index="' + index + '" type="button">' +
        '<div class="name">' + escapeHtml(target.name) + '</div>' +
        '<div class="meta"><span class="badge">' + escapeHtml(target.type) + '</span>' +
        '<span>' + escapeHtml(target.description || '') + '</span></div>' +
        '</button>';
    }).join('');
    box.querySelectorAll('.result').forEach((button) => {
      button.addEventListener('click', () => {
        selectedTarget = currentTargets[Number(button.dataset.index)];
        renderResults();
        byId('analyze-btn').disabled = false;
        byId('target-hint').textContent = 'Selected: ' + selectedTarget.name + '. Adjust the question, then start analysis.';
      });
    });
  }

  function resetPanels() {
    lastEventCount = -1;
    lastFileCount = -1;
    activeFile = null;
    byId('timeline').innerHTML = '<div class="empty">Starting the agent...</div>';
    byId('file-tree').innerHTML = '<div class="empty">Generated files will appear here.</div>';
    byId('file-viewer').textContent = 'Select a file to preview it.';
    byId('file-count').textContent = '0 files';
    byId('download-btn').disabled = true;
    byId('progress-bar').style.width = '0%';
    byId('progress-label').textContent = 'Job queued';
  }

  async function analyze() {
    let target = selectedTarget;
    const typed = byId('search-input').value.trim();
    if (!target && typed) {
      const isUrl = /^https?:\/\//i.test(typed);
      target = {
        name: isUrl ? typed : (typed.split(/[\\/]/).pop() || typed),
        type: isUrl ? 'url' : 'path',
        path: typed,
        description: 'Target typed in the search bar'
      };
    }
    if (!target) {
      setStatus('Select a target first', 'error');
      return;
    }
    const question = byId('question').value.trim() ||
      'Explain how this target works and reconstruct a minimal original version.';
    setStatus('Starting...');
    try {
      const data = await api('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, question })
      });
      jobId = data.id;
      resetPanels();
      if (pollTimer) clearInterval(pollTimer);
      await poll();
      pollTimer = setInterval(poll, 650);
    } catch (err) {
      setStatus('Start failed', 'error');
    }
  }

  function renderProgress(job) {
    const steps = job.steps || [];
    const finished = steps.filter((step) => step.status === 'done' || step.status === 'skipped').length;
    const percent = steps.length ? Math.round((finished / steps.length) * 100) : 0;
    byId('progress-bar').style.width = percent + '%';
    const current = steps.find((step) => step.status === 'running');
    byId('progress-label').textContent = current ? (percent + '% - ' + current.label) : (percent + '% - ' + job.status);
  }

  function renderTimeline(job) {
    const events = job.events || [];
    if (events.length === lastEventCount) return;
    lastEventCount = events.length;
    const box = byId('timeline');
    if (!events.length) {
      box.innerHTML = '<div class="empty">The agent has not reported anything yet.</div>';
      return;
    }
    box.innerHTML = events.map((event) => {
      const stamp = (event.at || '').slice(11, 19);
      return '<div class="event ' + escapeHtml(event.kind) + '">' +
        '<div class="title">' + escapeHtml(event.title) + '</div>' +
        '<div class="text">' + escapeHtml(event.text) + '</div>' +
        '<div class="time">' + escapeHtml(stamp) + '</div>' +
        '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function renderFiles(job) {
    const files = job.files || {};
    const names = Object.keys(files).sort();
    byId('download-btn').disabled = !job.downloadUrl;
    if (names.length === lastFileCount) return;
    lastFileCount = names.length;
    byId('file-count').textContent = names.length + ' files';
    const tree = byId('file-tree');
    if (!names.length) {
      tree.innerHTML = '<div class="empty">Generated files will appear here.</div>';
      return;
    }
    tree.innerHTML = names.map((name) =>
      '<button class="file-item" data-file="' + escapeHtml(name) + '" type="button">' + escapeHtml(name) + '</button>'
    ).join('');
    tree.querySelectorAll('.file-item').forEach((button) => {
      button.addEventListener('click', () => {
        activeFile = button.dataset.file;
        tree.querySelectorAll('.file-item').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        byId('file-viewer').textContent = files[activeFile];
      });
    });
    if (!activeFile) {
      activeFile = names.find((name) => name.endsWith('README.md')) || names[0];
      byId('file-viewer').textContent = files[activeFile];
      const first = tree.querySelector('[data-file="' + activeFile + '"]');
      if (first) first.classList.add('active');
    }
  }

  async function poll() {
    if (!jobId) return;
    try {
      const job = await api('/api/job/' + jobId);
      renderProgress(job);
      renderTimeline(job);
      renderFiles(job);
      if (job.status === 'done' || job.status === 'error') {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        setStatus(job.status === 'done' ? 'Complete' : 'Error', job.status === 'done' ? 'online' : 'error');
      }
    } catch (err) {
      setStatus('Poll failed', 'error');
    }
  }

  byId('search-btn').addEventListener('click', search);
  byId('search-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') search();
  });
  byId('analyze-btn').addEventListener('click', analyze);
  byId('download-btn').addEventListener('click', () => {
    if (jobId) window.location.assign('/api/download/' + jobId);
  });
  byId('doctor-btn').addEventListener('click', async () => {
    try {
      const status = await api('/api/status');
      window.alert(JSON.stringify(status, null, 2));
    } catch (err) {
      window.alert('Doctor check failed: ' + err.message);
    }
  });

  loadStatus();
  search();
}());
