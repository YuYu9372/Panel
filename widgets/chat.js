const chatWidget = {
  el: null,
  messages: [],
  pending: false,
  models: [{ id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'normal' }],
  modelIndex: 0,

  init() {
    this.el = document.getElementById('chat');
    this.el.innerHTML = `
      <div class="widget-heading">
        <div>
          <h2 class="chat-title" title="Switch model">Claude</h2>
        </div>
      </div>
      <div class="chat-log">
        <div class="chat-hint">Ask me anything.</div>
      </div>
      <form class="chat-form">
        <input class="chat-input" type="text" placeholder="Message" autocomplete="off" maxlength="500" aria-label="Chat message" />
        <button class="chat-send" type="submit" aria-label="Send">&#8593;</button>
      </form>
    `;
    this.el.querySelector('.chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.send();
    });
    this.el.querySelector('.chat-title').addEventListener('click', () => {
      this.setModel((this.modelIndex + 1) % this.models.length);
    });
    this.setModel(0);
    this.loadModels();
  },

  async loadModels() {
    try {
      const response = await fetch('/api/chat');
      const data = await response.json();
      if (!Array.isArray(data.models) || !data.models.length) return;
      this.models = data.models;
      const start = this.models.findIndex((m) => m.id === data.default);
      this.setModel(start >= 0 ? start : 0);
    } catch {}
  },

  setModel(index) {
    this.modelIndex = index;
    const model = this.models[index];
    this.el.querySelector('.chat-title').textContent = model.label;
    this.el.classList.remove('chat--normal', 'chat--better', 'chat--best');
    this.el.classList.add(`chat--${model.tier}`);
  },

  append(role, text) {
    const log = this.el.querySelector('.chat-log');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble--${role}`;
    bubble.textContent = text;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  },

  async send() {
    const input = this.el.querySelector('.chat-input');
    const text = input.value.trim();
    if (!text || this.pending) return;

    this.el.querySelector('.chat-hint')?.remove();
    input.value = '';
    this.pending = true;
    this.messages.push({ role: 'user', content: text });
    this.messages = this.messages.slice(-20);
    this.append('user', text);
    const reply = this.append('assistant', '…');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages,
          model: this.models[this.modelIndex].id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.reply) throw new Error(data.error || 'Chat failed');
      reply.textContent = data.reply;
      this.messages.push({ role: 'assistant', content: data.reply });
    } catch {
      this.messages.pop();
      reply.textContent = 'Something went wrong. Try again.';
      reply.classList.add('chat-bubble--error');
    }

    this.pending = false;
    const log = this.el.querySelector('.chat-log');
    log.scrollTop = log.scrollHeight;
    input.focus();
  },
};
