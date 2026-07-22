const versionWidget = {
  el: null,
  dialog: null,
  output: null,
  metadata: null,

  init() {
    this.el = document.getElementById('app-version');
    this.dialog = document.getElementById('version-dialog');
    this.output = document.getElementById('version-json');
    if (!this.el || !this.dialog || !this.output || !window.panelApp) return;
    this.el.addEventListener('click', (event) => {
      if (event.detail === 3) this.open();
    });
    document.getElementById('version-dialog-close').addEventListener('click', () => {
      this.dialog.close();
    });
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
    window.panelApp.onUpdateState((state) => this.render(state));
    window.panelApp.getUpdateState().then((state) => this.render(state)).catch(() => {});
  },

  render(state) {
    if (!state || !state.version) return;
    this.metadata = state.version;
    this.el.textContent = state.version.appVersion;
    if (this.dialog.open) this.output.textContent = JSON.stringify(this.metadata, null, 2);
  },

  open() {
    const fallback = { appVersion: this.el.textContent.trim() };
    this.output.textContent = JSON.stringify(this.metadata || fallback, null, 2);
    this.dialog.showModal();
  },
};
