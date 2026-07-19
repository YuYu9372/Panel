const tasksWidget = {
  el: null,
  interval: 300000,

  init() {
    this.el = document.getElementById('tasks');
    this.el.innerHTML = `
      <div class="widget-heading">
        <div>
          <div class="widget-kicker">TO-DO</div>
          <h2>Tasks</h2>
        </div>
        <svg class="tasks-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none"
             stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h10M4 12h10M4 17h6" />
          <path d="M17.5 6.6l1.7 1.7L23 4.5" />
        </svg>
      </div>
      <div class="tasks-body"><div class="tasks-empty">Loading…</div></div>
    `;
    this.update();
  },

  describeDue(due) {
    if (!due) return { text: '', overdue: false };
    const date = new Date(due);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      text: `due ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
      overdue: date < today,
    };
  },

  render(folders) {
    const body = this.el.querySelector('.tasks-body');
    if (folders === null) {
      body.innerHTML = '<div class="tasks-empty">Tasks unavailable</div>';
      return;
    }
    if (!folders.length) {
      body.innerHTML = '<div class="tasks-empty">All caught up</div>';
      return;
    }

    body.replaceChildren();
    folders.forEach((folder) => {
      const section = document.createElement('div');
      section.className = 'task-folder';

      const head = document.createElement('div');
      head.className = 'folder-head';
      head.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 6.5a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        </svg>
        <span class="folder-name"></span>
      `;
      head.querySelector('.folder-name').textContent = folder.list_title;
      section.appendChild(head);

      const list = document.createElement('ul');
      list.className = 'task-list';
      folder.tasks.forEach((task) => {
        const due = this.describeDue(task.due);
        const item = document.createElement('li');
        item.className = 'task-item';
        item.innerHTML = `
          <button class="task-check" type="button" aria-label="Complete task"></button>
          <div class="task-main">
            <span class="task-title"></span>
            <span class="task-due${due.overdue ? ' is-overdue' : ''}"></span>
          </div>
        `;
        item.querySelector('.task-title').textContent = task.title;
        item.querySelector('.task-due').textContent = due.text;
        item.querySelector('.task-check').addEventListener('click', () =>
          this.complete(item, folder.list_id, task.id));
        list.appendChild(item);
      });
      section.appendChild(list);
      body.appendChild(section);
    });
  },

  async complete(item, listId, taskId) {
    if (item.classList.contains('is-done')) return;
    item.classList.add('is-done');
    try {
      const response = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: listId, task_id: taskId }),
      });
      if (!response.ok) throw new Error('complete failed');
      setTimeout(() => {
        const folder = item.closest('.task-folder');
        item.remove();
        if (folder && !folder.querySelector('.task-item')) folder.remove();
        if (!this.el.querySelector('.task-item')) {
          this.el.querySelector('.tasks-body').innerHTML =
            '<div class="tasks-empty">All caught up</div>';
        }
      }, 450);
    } catch {
      item.classList.remove('is-done');
    }
  },

  async update() {
    try {
      const response = await fetch('/api/tasks');
      const data = await response.json();
      this.render(data.folders);
    } catch {
      this.render(null);
    }
  },
};
