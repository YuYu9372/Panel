const updateWidget = {
  el: null,
  popover: null,
  primary: null,
  state: null,
  currentPatchId: '',
  ui: {
    eyebrow: 'PANEL UPDATE',
    availableTitle: 'Update available',
    downloadedTitle: 'Ready to restart',
    releaseLabel: "WHAT'S NEW",
    downloadLabel: 'Download update',
    installLabel: 'Restart and install',
    checkingLabel: 'Checking for updates…',
    upToDateLabel: 'Panel is up to date.',
    errorTitle: 'Update needs attention',
  },

  init() {
    this.el = document.getElementById('update-button');
    this.popover = document.getElementById('update-popover');
    this.primary = document.getElementById('update-primary');
    if (!this.el || !this.popover || !window.panelApp) return;
    this.el.addEventListener('click', () => this.toggle());
    document.getElementById('update-close').addEventListener('click', () => this.close());
    this.primary.addEventListener('click', () => this.performPrimaryAction());
    document.addEventListener('click', (event) => {
      if (!this.popover.hidden && !event.target.closest('.update-anchor')) this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
    window.panelApp.onUpdateState((state) => this.render(state));
    window.panelApp.getUpdateState().then((state) => this.render(state)).catch(() => {});
  },

  toggle() {
    if (this.popover.hidden) this.open();
    else this.close();
  },

  open() {
    this.popover.hidden = false;
    this.el.setAttribute('aria-expanded', 'true');
  },

  close() {
    this.popover.hidden = true;
    this.el.setAttribute('aria-expanded', 'false');
  },

  resetPatchStyle() {
    for (const property of [
      '--update-accent',
      '--update-accent-soft',
      '--update-surface',
      '--update-text',
      '--update-muted',
      '--update-light-accent',
      '--update-light-accent-soft',
      '--update-light-surface',
      '--update-light-text',
      '--update-light-muted',
      '--update-dark-accent',
      '--update-dark-accent-soft',
      '--update-dark-surface',
      '--update-dark-text',
      '--update-dark-muted',
      '--update-radius',
      '--update-width',
    ]) {
      this.popover.style.removeProperty(property);
    }
    delete this.popover.dataset.density;
    this.ui = {
      eyebrow: 'PANEL UPDATE',
      availableTitle: 'Update available',
      downloadedTitle: 'Ready to restart',
      releaseLabel: "WHAT'S NEW",
      downloadLabel: 'Download update',
      installLabel: 'Restart and install',
      checkingLabel: 'Checking for updates…',
      upToDateLabel: 'Panel is up to date.',
      errorTitle: 'Update needs attention',
    };
  },

  applyPatch(patch) {
    this.resetPatchStyle();
    if (!patch) {
      applyLiveConfigPatch(null);
      this.currentPatchId = '';
      return;
    }
    try {
      applyLiveConfigPatch(patch);
      const ui = patch.ui || {};
      for (const field of Object.keys(this.ui)) {
        if (ui[field]) this.ui[field] = ui[field];
      }
      const properties = {
        accent: '--update-light-accent',
        accentSoft: '--update-light-accent-soft',
        surface: '--update-light-surface',
        text: '--update-light-text',
        muted: '--update-light-muted',
        darkAccent: '--update-dark-accent',
        darkAccentSoft: '--update-dark-accent-soft',
        darkSurface: '--update-dark-surface',
        darkText: '--update-dark-text',
        darkMuted: '--update-dark-muted',
      };
      for (const [field, property] of Object.entries(properties)) {
        if (ui[field]) this.popover.style.setProperty(property, ui[field]);
      }
      if (ui.radius) this.popover.style.setProperty('--update-radius', `${ui.radius}px`);
      if (ui.width) this.popover.style.setProperty('--update-width', `${ui.width}px`);
      if (ui.density) this.popover.dataset.density = ui.density;
      this.currentPatchId = patch.patchId;
      requestAnimationFrame(() => {
        window.panelApp.confirmUiPatch(patch.patchId);
      });
    } catch {
      this.resetPatchStyle();
      applyLiveConfigPatch(null);
      this.currentPatchId = '';
      window.panelApp.reportUiPatchFailure(patch.patchId);
    }
  },

  render(state) {
    this.state = state;
    const patch = state.uiPatch && state.uiPatch.patch;
    const patchId = patch ? patch.patchId : '';
    if (patchId !== this.currentPatchId) this.applyPatch(patch || null);
    const visibleStatuses = new Set(['available', 'downloading', 'downloaded']);
    const visible = visibleStatuses.has(state.status);
    this.el.hidden = !visible;
    this.el.dataset.state = state.status;
    if (!visible) this.close();

    document.getElementById('update-eyebrow').textContent = this.ui.eyebrow;
    document.getElementById('update-current-version').textContent = state.currentDisplayVersion;
    document.getElementById('update-available-version').textContent = state.availableDisplayVersion || '—';
    document.getElementById('update-status').textContent = state.message || '';
    document.getElementById('update-release-label').textContent = this.ui.releaseLabel;

    const title = document.getElementById('update-title');
    if (state.status === 'downloaded') title.textContent = this.ui.downloadedTitle;
    else if (state.status === 'error') title.textContent = this.ui.errorTitle;
    else title.textContent = this.ui.availableTitle;

    const notes = document.getElementById('update-release-notes');
    notes.replaceChildren();
    const entries = state.releaseNotes && state.releaseNotes.length
      ? state.releaseNotes
      : ['Security and reliability improvements.'];
    for (const entry of entries) {
      const item = document.createElement('li');
      item.textContent = entry;
      notes.appendChild(item);
    }

    const progress = document.getElementById('update-progress');
    progress.hidden = state.status !== 'downloading';
    progress.value = state.progress || 0;

    this.primary.disabled = state.status === 'downloading';
    if (state.status === 'downloaded') this.primary.textContent = this.ui.installLabel;
    else if (state.status === 'downloading') this.primary.textContent = `Downloading ${state.progress || 0}%`;
    else this.primary.textContent = this.ui.downloadLabel;
  },

  async performPrimaryAction() {
    if (!this.state) return;
    this.primary.disabled = true;
    try {
      if (this.state.status === 'available') await window.panelApp.downloadUpdate();
      else if (this.state.status === 'downloaded') await window.panelApp.installUpdate();
    } catch {
      document.getElementById('update-status').textContent = 'The update action could not be completed.';
      this.primary.disabled = false;
    }
  },
};
