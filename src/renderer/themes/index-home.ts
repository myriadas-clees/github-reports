// Homepage markup shared by every theme: hero (estimated effort + initiative mix), the
// month -> work-week -> day ledger, and the "Thinking about new work?" links.
// Registered as Handlebars partials by renderIndexPage; themes keep their own header and chrome.

const MIX_SEGMENTS = `{{#each segments}}<span class="alloc-seg {{colorClass}}" style="--grow:{{grow}}" title="{{title}}"></span>{{/each}}`;

export const INDEX_HERO_PARTIAL = `<section class="home-hero alloc alloc--inline" aria-label="Estimated effort, reporting window">
    <div class="home-hero-top">
      <div class="home-hero-main">
        {{#if overview.estimate}}
        <div class="home-hero-days" title="{{estimateNote}}">
          <span class="home-hero-value">≈ {{overview.estimate.value}}</span>
          <span class="home-hero-unit">{{overview.estimate.unit}}</span>
          <span class="est-tag">estimated</span>
        </div>
        <p class="est-note">{{estimateNote}}</p>
        {{/if}}
      </div>
      <dl class="home-hero-counts" aria-label="Archive totals">
        <div><dt>commits</dt><dd>{{overview.commits}}</dd></div>
        <div><dt>pull requests</dt><dd>{{overview.prs}}</dd></div>
        <div><dt>reviews</dt><dd>{{overview.reviews}}</dd></div>
      </dl>
    </div>
    {{#if overview.hasMix}}
    <div class="home-hero-mix">
      <span class="alloc-bar alloc-bar--md" role="img" aria-label="{{overview.mixBar.ariaLabel}}">
        {{#with overview.mixBar}}${MIX_SEGMENTS}{{/with}}
      </span>
      <ul class="alloc-legend" aria-label="Initiative colors">
        {{#each overview.legend}}
        <li><span class="alloc-swatch {{colorClass}}" aria-hidden="true"></span><span>{{name}}</span> <span class="alloc-legend-pct">{{percent}}</span></li>
        {{/each}}
      </ul>
    </div>
    {{/if}}
  </section>`;

export const INDEX_PLANNING_PARTIAL = `{{#if hasEstimatePage}}
  <section class="planning" aria-labelledby="planning-title">
    <h2 class="planning-title" id="planning-title">Thinking about new work?</h2>
    <ul class="planning-links">
      {{#if hasAppEstimates}}<li><a href="estimate/?kind=app">Have a new app idea?</a></li>{{/if}}
      <li><a href="estimate/?kind=feature">A feature you'd like added?</a></li>
      <li><a href="estimate/?kind=change">A change you'd like to make?</a></li>
      <li><a href="estimate/?kind=bug">Found a bug?</a></li>
    </ul>
  </section>
  {{/if}}`;

export const INDEX_LEDGER_PARTIAL = `<section class="ledger" aria-label="Work week archive">
    <div class="ledger-heading">
      <span>Activity ledger</span>
      <span>{{overview.reportCount}} reports</span>
    </div>

    {{#*inline "day-row"}}
        <a href="{{this.path}}/" class="day-row">
          <div class="day-date"><strong>{{this.dayLabel}}</strong><span>{{this.weekdayLabel}}</span></div>
          <div class="day-story">
            <div class="day-title">{{#if this.title}}{{this.title}}{{else}}{{this.dateLabel}}{{/if}}</div>
            {{#if this.subtitle}}<div class="day-subtitle">{{this.subtitle}}</div>{{/if}}
          </div>
          {{#if this.stats}}
          <div class="day-stats">
            <span><b>{{this.stats.commits}}</b> C</span>
            <span><b>{{this.stats.prs}}</b> PR</span>
            <span><b>{{this.stats.reviews}}</b> R</span>
          </div>
          {{/if}}
          <span class="day-open" aria-hidden="true">↗</span>
        </a>
    {{/inline}}

    {{#each monthGroups}}
    <details class="month-group" {{#if @first}}open{{/if}} id="{{this.anchor}}">
      <summary class="month-summary">
        <div class="month-name"><span>{{this.label}}</span><strong>{{this.year}}</strong></div>
        <div class="month-days">{{#if this.estimate}}<span title="{{@root.estimateNote}}">≈ {{this.estimate.value}} {{this.estimate.unit}}</span> <span class="est-tag">estimated</span>{{/if}}</div>
        <div class="month-tape" role="img" aria-label="Estimated effort per day" title="Estimated effort per day">
          {{#each this.reports}}<i style="--activity: {{this.activityPercent}}%"></i>{{/each}}
        </div>
        <div class="month-totals">
          <span><b>{{this.stats.commits}}</b> commits</span>
          <span><b>{{this.stats.prs}}</b> PRs</span>
          <span><b>{{this.stats.reviews}}</b> reviews</span>
        </div>
        <span class="month-count" aria-label="Expand or collapse month"></span>
      </summary>

      {{#if this.weeks.length}}
      <div class="week-ledger">
        {{#each this.weeks}}
        <div class="week-block">
          <a href="{{this.href}}" class="week-row">
            <div class="week-label"><strong>{{this.label}}</strong>{{#if this.open}}<span class="week-flag">(in progress)</span>{{/if}}</div>
            <div class="week-story">
              {{#if this.estimate}}
              <div class="week-delivered"><span title="{{@root.estimateNote}}">≈ {{this.estimate.value}} {{this.estimate.unit}}</span> <span class="est-tag">estimated</span></div>
              {{/if}}
              {{#if this.mixBar.segments.length}}
              <div class="week-mix alloc alloc--inline">
                <span class="week-mix-track"><span class="week-mix-fill" style="width: {{this.barWidth}}%"><span class="alloc-bar alloc-bar--sm" role="img" aria-label="{{this.mixBar.ariaLabel}}">
                  {{#with this.mixBar}}${MIX_SEGMENTS}{{/with}}
                </span></span></span>
              </div>
              {{/if}}
              {{#if this.hasInitiatives}}
              <ul class="week-initiatives alloc alloc--inline" aria-label="Top initiatives">
                {{#each this.initiatives}}<li><span class="alloc-swatch {{this.colorClass}}" aria-hidden="true"></span><span>{{this.name}}</span> <b>{{this.percent}}</b></li>{{/each}}
              </ul>
              {{/if}}
              {{#if this.outcome}}<div class="week-outcome">{{this.outcome}}</div>{{/if}}
            </div>
            <div class="week-counts">
              <span><b>{{this.stats.commits}}</b> commits</span>
              <span><b>{{this.stats.prs}}</b> PRs</span>
              <span><b>{{this.stats.reviews}}</b> reviews</span>
            </div>
            <span class="day-open" aria-hidden="true">↗</span>
          </a>
          <details class="week-days">
            <summary>{{this.dayCountLabel}}</summary>
            <div class="day-list">
              {{#each this.reports}}
              {{> day-row}}
              {{/each}}
            </div>
          </details>
        </div>
        {{/each}}
      </div>
      {{/if}}

      {{#if this.looseReports.length}}
      <div class="day-list">
        {{#each this.looseReports}}
        {{> day-row}}
        {{/each}}
      </div>
      {{/if}}
    </details>
    {{/each}}
  </section>`;
