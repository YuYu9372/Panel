const chatWidget = {
  el: null,
  messages: [],
  pending: false,

  init() {
    this.el = document.getElementById('chat');
    this.el.innerHTML = `
      <div class="widget-heading">
        <div>
          <div class="widget-kicker">AI</div>
          <h2>Chat</h2>
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
        body: JSON.stringify({ messages: this.messages }),
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
