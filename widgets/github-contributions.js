const githubContributionsWidget = {
  el: null,
  interval: 900000,

  init() {
    this.el = document.getElementById('github-contributions');
    this.el.innerHTML = `
      <div class="widget-heading">
        <div>
          <div class="widget-kicker">GITHUB</div>
          <h2>Contributions</h2>
        </div>
        <a class="github-profile-link" href="https://github.com/YuYu9372"
           target="_blank" rel="noreferrer" aria-label="Open GitHub profile">
          <svg class="github-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .8a11.4 11.4 0 0 0-3.6 22.2c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.4 11.4 0 0 0 12 .8Z"/>
          </svg>
        </a>
      </div>
      <div class="contribution-summary">
        <span class="contribution-total">—</span>
        <span class="contribution-label">contributions<br>in the last year</span>
      </div>
      <div class="contribution-graph" role="img" aria-label="GitHub contribution activity">
        <div class="contribution-grid"></div>
      </div>
      <div class="contribution-legend" aria-hidden="true">
        <span>Less</span>
        <i data-level="0"></i><i data-level="1"></i><i data-level="2"></i>
        <i data-level="3"></i><i data-level="4"></i>
        <span>More</span>
      </div>
      <div class="widget-updated github-updated">Connecting to GitHub…</div>
    `;
    this.update();
  },

  render(data) {
    this.el.querySelector('.contribution-total').textContent =
      data.total.toLocaleString();
    this.el.querySelector('.github-profile-link').href = data.profile_url;

    const grid = this.el.querySelector('.contribution-grid');
    grid.replaceChildren();
    data.days.forEach((day) => {
      const square = document.createElement('span');
      square.className = 'contribution-day';
      square.dataset.level = day.level;
      square.title = day.count === 1
        ? `1 contribution on ${day.date}`
        : `${day.count} contributions on ${day.date}`;
      square.setAttribute('aria-hidden', 'true');
      grid.appendChild(square);
    });

    this.el.querySelector('.contribution-graph').setAttribute(
      'aria-label',
      `${data.total.toLocaleString()} GitHub contributions in the last year`,
    );
    this.el.querySelector('.github-updated').textContent = data.stale
      ? 'Showing cached GitHub data'
      : `@${data.username} · Updated ${new Date(data.updated_at).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit',
      })}`;
  },

  async update() {
    try {
      const response = await fetch('/api/github-contributions', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Contribution API returned ${response.status}`);
      this.render(await response.json());
    } catch {
      this.el.querySelector('.github-updated').textContent =
        'GitHub contribution data unavailable';
    }
  },
};
