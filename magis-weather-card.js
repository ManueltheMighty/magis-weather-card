/**
 * MagIS Weather Card
 * A standalone Home Assistant Lovelace custom card, including a visual editor.
 *
 * Installation:
 * 1. Copy this file to /config/www/magis-weather-card.js
 * 2. Settings -> Dashboards -> three dots top right -> Resources
 *    -> Add resource -> URL: /local/magis-weather-card.js -> Type: JavaScript Module
 * 3. Add the card to your dashboard (configurable via the visual editor, or via YAML):
 *
 * type: custom:magis-weather-card
 * entity: weather.home
 * warning_entity: sensor.current_warning_level
 * advance_warning_entity: sensor.advance_warning_level
 * default_background: /local/backgrounds/weather/default.jpg
 * forecast_slots_hourly: 8
 * forecast_slots_daily: 7
 * text_icon_shadow: true
 * tap_action:
 *   action: more-info
 * background_images:
 *   sunny: /local/backgrounds/weather/sunny.jpg
 *   clear-night: /local/backgrounds/weather/clearnight.jpg
 *   cloudy: /local/backgrounds/weather/cloudy.jpg
 *   partlycloudy: /local/backgrounds/weather/partlycloudy.jpg
 *   rainy: /local/backgrounds/weather/rainy.jpg
 *   pouring: /local/backgrounds/weather/rainy.jpg
 *   snowy: /local/backgrounds/weather/snowy.jpg
 *   snowy-rainy: /local/backgrounds/weather/snowy-rainy.jpg
 *   fog: /local/backgrounds/weather/fog.jpg
 *   windy: /local/backgrounds/weather/stormy.jpg
 *   hail: /local/backgrounds/weather/stormy.jpg
 *   lightning: /local/backgrounds/weather/lightning.jpg
 *   lightning-rainy: /local/backgrounds/weather/stormy.jpg
 */

const CONDITION_ICONS = {
  'sunny': 'mdi:weather-sunny',
  'clear-night': 'mdi:weather-night',
  'cloudy': 'mdi:weather-cloudy',
  'partlycloudy': 'mdi:weather-partly-cloudy',
  'rainy': 'mdi:weather-rainy',
  'pouring': 'mdi:weather-pouring',
  'snowy': 'mdi:weather-snowy',
  'snowy-rainy': 'mdi:weather-snowy-rainy',
  'fog': 'mdi:weather-fog',
  'windy': 'mdi:weather-windy',
  'hail': 'mdi:weather-hail',
  'lightning': 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  'exceptional': 'mdi:alert-circle-outline',
};

class MagisWeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hourly = [];
    this._daily = [];
    this._subscribed = false;
    // Event delegation: a click/tap anywhere on the card triggers tap_action.
    this.shadowRoot.addEventListener('click', () => this._handleTap());
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please provide "entity" (a weather entity) in the card configuration.');
    }
    this.config = {
      background_images: {},
      default_background: '',
      warning_entity: null,
      advance_warning_entity: null,
      forecast_slots_hourly: 8,
      forecast_slots_daily: 7,
      text_icon_shadow: true,
      tap_action: { action: 'more-info' },
      ...config,
    };
  }

  // Executes the configured tap_action. Supports: more-info, toggle,
  // navigate, url, perform-action/call-service, none.
  _handleTap() {
    this._callAction(this.config && this.config.tap_action);
  }

  _callAction(actionConfig) {
    if (!actionConfig || !actionConfig.action || actionConfig.action === 'none') return;
    const entityId = actionConfig.entity || (this.config && this.config.entity);

    switch (actionConfig.action) {
      case 'more-info':
        this.dispatchEvent(new CustomEvent('hass-more-info', {
          detail: { entityId },
          bubbles: true,
          composed: true,
        }));
        break;

      case 'toggle':
        if (this._hass && entityId) {
          this._hass.callService('homeassistant', 'toggle', { entity_id: entityId });
        }
        break;

      case 'navigate':
        if (actionConfig.navigation_path) {
          window.history.pushState(null, '', actionConfig.navigation_path);
          this.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
        }
        break;

      case 'url':
        if (actionConfig.url_path) {
          window.open(actionConfig.url_path, actionConfig.new_tab === false ? '_self' : '_blank');
        }
        break;

      case 'call-service':
      case 'perform-action': {
        const serviceStr = actionConfig.perform_action || actionConfig.service;
        if (serviceStr && this._hass) {
          const [domain, service] = serviceStr.split('.');
          const data = actionConfig.data || actionConfig.service_data || {};
          const target = actionConfig.target || (entityId ? { entity_id: entityId } : undefined);
          if (domain && service) {
            this._hass.callService(domain, service, data, target);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._subscribeForecast();
    this._render();
  }

  connectedCallback() {
    this._clockTimer = setInterval(() => this._render(), 30 * 1000);
  }

  disconnectedCallback() {
    clearInterval(this._clockTimer);
    if (this._unsubHourly) this._unsubHourly();
    if (this._unsubDaily) this._unsubDaily();
    this._subscribed = false;
  }

  async _subscribeForecast() {
    if (!this._hass || !this.config || this._subscribed) return;
    this._subscribed = true;
    const entity_id = this.config.entity;

    try {
      this._unsubHourly = await this._hass.connection.subscribeMessage(
        (msg) => {
          this._hourly = msg.forecast || [];
          this._render();
        },
        { type: 'weather/subscribe_forecast', entity_id, forecast_type: 'hourly' }
      );
    } catch (e) {
      console.warn('MagIS Weather Card: hourly forecast not available', e);
    }

    try {
      this._unsubDaily = await this._hass.connection.subscribeMessage(
        (msg) => {
          this._daily = msg.forecast || [];
          this._render();
        },
        { type: 'weather/subscribe_forecast', entity_id, forecast_type: 'daily' }
      );
    } catch (e) {
      console.warn('MagIS Weather Card: daily forecast not available', e);
    }
  }

  _conditionIcon(condition) {
    return CONDITION_ICONS[condition] || 'mdi:weather-cloudy';
  }

  _background(condition) {
    const raw = (this.config.background_images && this.config.background_images[condition])
      || this.config.default_background
      || '';
    // Accepts either a single path (string) or multiple paths (array) per
    // weather condition. With multiple, one is picked at random and kept
    // until the condition changes (avoids flicker on every 30s redraw
    // triggered by the clock).
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    if (!list.length) return '';
    if (this._bgCondition !== condition || !this._bgCurrent || !list.includes(this._bgCurrent)) {
      this._bgCondition = condition;
      this._bgCurrent = list[Math.floor(Math.random() * list.length)];
    }
    return this._bgCurrent;
  }

  _warnLevel(entityId) {
    if (!entityId || !this._hass) return 0;
    const st = this._hass.states[entityId];
    if (!st) return 0;
    const n = parseInt(st.state, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // Reads level + a short description from a DWD-style warning entity
  // (attributes warning_1_name / warning_1_headline), e.g. "Starkregen", "Sturm".
  _warningInfo(entityId) {
    const level = this._warnLevel(entityId);
    if (!level || !this._hass || !entityId) return { level, name: '' };
    const st = this._hass.states[entityId];
    const name = (st && (st.attributes.warning_1_name || st.attributes.warning_1_headline)) || '';
    return { level, name };
  }

  _renderHourly() {
    if (!this._hourly.length) return '';
    const now = new Date();
    const upcoming = this._hourly.filter((f) => new Date(f.datetime) > now);
    const slots = upcoming.length ? upcoming : this._hourly;
    return slots.slice(0, this.config.forecast_slots_hourly).map((f) => {
      const d = new Date(f.datetime);
      const hourStr = d.toLocaleTimeString([], { hour: '2-digit' });
      return `
        <div class="hour-slot">
          <div class="hour-time">${hourStr}</div>
          <ha-icon icon="${this._conditionIcon(f.condition)}"></ha-icon>
          <div class="hour-temp">${Math.round(f.temperature)}°</div>
        </div>`;
    }).join('');
  }

  _renderDaily() {
    if (!this._daily.length) return '';
    return this._daily.slice(0, this.config.forecast_slots_daily).map((f) => {
      const d = new Date(f.datetime);
      const dayStr = d.toLocaleDateString([], { weekday: 'short' });
      const low = f.templow !== undefined ? `${Math.round(f.templow)}° / ` : '';
      return `
        <div class="day-row">
          <div class="day-name">${dayStr}</div>
          <ha-icon icon="${this._conditionIcon(f.condition)}"></ha-icon>
          <div class="day-temp">${low}${Math.round(f.temperature)}°</div>
        </div>`;
    }).join('');
  }

  _render() {
    if (!this._hass || !this.config) return;
    const stateObj = this._hass.states[this.config.entity];

    if (!stateObj) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:16px;">Entity ${this.config.entity} not found.</div></ha-card>`;
      return;
    }

    const condition = stateObj.state;
    const temp = stateObj.attributes.temperature;
    const windSpeed = stateObj.attributes.wind_speed;
    const windUnit = stateObj.attributes.wind_speed_unit || '';
    const bg = this._background(condition);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const currentWarnInfo = this._warningInfo(this.config.warning_entity);
    const advanceWarnInfo = this._warningInfo(this.config.advance_warning_entity);

    let warningHtml = '';
    if (currentWarnInfo.level > 0) {
      const color = currentWarnInfo.level >= 3 ? '#ff1744' : currentWarnInfo.level === 2 ? '#ff9100' : '#ffea00';
      warningHtml = `
        <div class="warning-info" title="Active weather warning (level ${currentWarnInfo.level})">
          <ha-icon icon="mdi:alert" style="color:${color}"></ha-icon>
          ${currentWarnInfo.name ? `<span>${currentWarnInfo.name}</span>` : ''}
        </div>`;
    } else if (advanceWarnInfo.level > 0) {
      warningHtml = `
        <div class="warning-info" title="Advance warning (level ${advanceWarnInfo.level})">
          <ha-icon icon="mdi:alert-outline" style="color:rgba(255,255,255,0.6)"></ha-icon>
          ${advanceWarnInfo.name ? `<span>${advanceWarnInfo.name}</span>` : ''}
        </div>`;
    }

    const windHtml = windSpeed !== undefined
      ? `<div class="wind-row"><ha-icon icon="mdi:windsock"></ha-icon><span>${Math.round(windSpeed)} ${windUnit}</span></div>`
      : '';

    // Text/icon shadow -- toggled from the editor (text_icon_shadow).
    // Adjust strength here (blur radius / opacity).
    const shadowEnabled = this.config.text_icon_shadow !== false;
    const textShadowCss = shadowEnabled ? '1px 1px 3px rgba(0,0,0,0.6)' : 'none';
    const iconShadowCss = shadowEnabled ? 'drop-shadow(1px 1px 2px rgba(0,0,0,0.6))' : 'none';

    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          position: relative;
          overflow: hidden;
          border-radius: 15px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          background-image: ${bg ? `url('${bg}')` : 'none'};
          background-color: ${bg ? 'transparent' : 'var(--card-background-color)'};
          background-size: cover;
          background-position: center;
          color: #fff;
          /* Overall card height -- adjust here if it should be taller/shorter */
          min-height: 420px;
          cursor: ${this.config.tap_action && this.config.tap_action.action !== 'none' ? 'pointer' : 'default'};
        }
        .overlay {
          position: relative;
          height: 100%;
          box-sizing: border-box;
          padding: 16px;
          display: flex;
          flex-direction: column;
          background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0));
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .header-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .warning-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          opacity: 0.95;
          text-shadow: ${textShadowCss};
        }
        .warning-info ha-icon {
          --mdc-icon-size: 20px;
        }
        .time {
          font-size: 40px;
          font-weight: 250;
          text-shadow: ${textShadowCss};
        }
        .temp {
          font-size: 40px;
          font-weight: 250;
          text-shadow: ${textShadowCss};
        }
        .current {
          /* flex: 1 makes this block take up all the space between the
             header and the forecast; justify-content: center vertically
             centers the icon + wind row.
             align-items controls the HORIZONTAL position:
             center = middle, flex-start = left, flex-end = right.
             -> ADJUST HERE if the position needs changing. */
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          gap: 6px;
          /* Fine-tuning: distance from the right edge of the card.
             Increase to move further left. */
          padding-right: 8px;
          margin-bottom: 14px;
        }
        .condition-icon {
          --mdc-icon-size: 50px;
        }
        .wind-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          opacity: 0.9;
          text-shadow: ${textShadowCss};
        }
        .wind-row ha-icon {
          --mdc-icon-size: 18px;
        }
        .hourly {
          display: flex;
          overflow-x: auto;
          gap: 16px;
          border-top: 1px solid rgba(255,255,255,0.2);
          padding-top: 10px;
          padding-bottom: 8px;
          scrollbar-width: thin;
        }
        .hour-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          min-width: 40px;
          font-size: 12px;
          flex-shrink: 0;
          text-shadow: ${textShadowCss};
        }
        .daily {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.2);
          padding-top: 10px;
        }
        .day-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          text-shadow: ${textShadowCss};
        }
        .day-name {
          width: 40px;
          text-transform: capitalize;
        }
        /* Shadow for ALL icons in the card (weather, wind, warning, forecast icons) */
        ha-icon {
          filter: ${iconShadowCss};
        }
      </style>
      <ha-card>
        <div class="overlay">
          <div class="header">
            <div class="header-left">
              <div class="time">${timeStr}</div>
              ${warningHtml}
            </div>
            <div class="temp">${temp !== undefined ? Math.round(temp) + '°' : '--'}</div>
          </div>
          <div class="current">
            <ha-icon class="condition-icon" icon="${this._conditionIcon(condition)}"></ha-icon>
            ${windHtml}
          </div>
          <div class="hourly">${this._renderHourly()}</div>
          <div class="daily">${this._renderDaily()}</div>
        </div>
      </ha-card>
    `;
  }

  getCardSize() {
    return 6;
  }

  static getConfigElement() {
    return document.createElement('magis-weather-card-editor');
  }

  static getStubConfig() {
    return { entity: 'weather.home', forecast_slots_hourly: 8, forecast_slots_daily: 7, text_icon_shadow: true };
  }
}

customElements.define('magis-weather-card', MagisWeatherCard);

/**
 * Visual editor
 */
class MagisWeatherCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    if (this.isConnected) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) {
      this.querySelectorAll('ha-entity-picker').forEach((p) => {
        p.hass = hass;
      });
    } else {
      this._render();
    }
  }

  connectedCallback() {
    if (this._config) this._render();
  }

  _fireChanged() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  _textChanged(ev) {
    const key = ev.target.getAttribute('data-config-key');
    if (!key) return;
    let value;
    if (ev.target.type === 'checkbox') {
      value = ev.target.checked;
    } else if (ev.target.type === 'number') {
      value = ev.target.value === '' ? undefined : Number(ev.target.value);
    } else {
      value = ev.target.value;
    }
    this._config = { ...this._config, [key]: value };
    this._fireChanged();
  }

  _backgroundImageChanged(ev) {
    const condition = ev.target.getAttribute('data-condition');
    if (!condition) return;
    // Multiple images for the same condition: enter comma-separated,
    // e.g. "/local/.../sunny1.jpg, /local/.../sunny2.jpg"
    const parts = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
    const images = { ...(this._config.background_images || {}) };
    if (!parts.length) {
      delete images[condition];
    } else if (parts.length === 1) {
      images[condition] = parts[0];
    } else {
      images[condition] = parts;
    }
    this._config = { ...this._config, background_images: images };
    this._fireChanged();
  }

  _tapActionFieldChanged(ev) {
    const key = ev.target.getAttribute('data-tap-key');
    if (!key) return;
    const current = { ...(this._config.tap_action || { action: 'more-info' }) };
    current[key] = ev.target.value;
    this._config = { ...this._config, tap_action: current };
    this._fireChanged();
  }

  _render() {
    if (!this._config) return;
    const shadowChecked = this._config.text_icon_shadow !== false;
    const tap = this._config.tap_action || { action: 'more-info' };
    this.innerHTML = `
      <style>
        .row { display:flex; flex-direction:column; margin-bottom:14px; }
        .row-checkbox { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
        .row-checkbox input { width:16px; height:16px; }
        label { font-size:12px; color: var(--secondary-text-color); margin-bottom:4px; }
        input {
          padding:8px;
          border-radius:4px;
          border:1px solid var(--divider-color, #ccc);
          font-family: inherit;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #000);
        }
        select {
          padding:8px;
          border-radius:4px;
          border:1px solid var(--divider-color, #ccc);
          font-family: inherit;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #000);
        }
        .hint { font-size: 11px; color: var(--secondary-text-color); margin-top: 4px; }
        .bg-images {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .bg-image-row {
          display: grid;
          grid-template-columns: 24px 90px 1fr;
          align-items: center;
          gap: 8px;
        }
        .bg-image-row ha-icon {
          --mdc-icon-size: 20px;
        }
        .bg-image-label {
          font-size: 12px;
          text-transform: capitalize;
        }
        .bg-image-row input {
          padding: 6px 8px;
          font-size: 12px;
        }
      </style>
      <div class="row">
        <label>Weather entity (entity)</label>
        <ha-entity-picker data-config-key="entity"></ha-entity-picker>
      </div>
      <div class="row">
        <label>Current warning level entity (warning_entity, optional)</label>
        <ha-entity-picker data-config-key="warning_entity"></ha-entity-picker>
      </div>
      <div class="row">
        <label>Advance warning level entity (advance_warning_entity, optional)</label>
        <ha-entity-picker data-config-key="advance_warning_entity"></ha-entity-picker>
      </div>
      <div class="row">
        <label>Default background image (default_background)</label>
        <input type="text" data-config-key="default_background" value="${this._config.default_background || ''}">
      </div>
      <div class="row">
        <label>Number of hours in the hourly forecast</label>
        <input type="number" min="1" max="24" data-config-key="forecast_slots_hourly" value="${this._config.forecast_slots_hourly ?? 8}">
      </div>
      <div class="row">
        <label>Number of days in the daily forecast</label>
        <input type="number" min="1" max="10" data-config-key="forecast_slots_daily" value="${this._config.forecast_slots_daily ?? 7}">
      </div>
      <div class="row-checkbox">
        <input type="checkbox" id="shadow-toggle" data-config-key="text_icon_shadow" ${shadowChecked ? 'checked' : ''}>
        <label for="shadow-toggle" style="margin-bottom:0;">Shadow on text &amp; icons (improves readability)</label>
      </div>
      <div class="row">
        <label>Tap action (action when the card is tapped)</label>
        <select data-tap-key="action">
          <option value="more-info" ${tap.action === 'more-info' ? 'selected' : ''}>More info</option>
          <option value="toggle" ${tap.action === 'toggle' ? 'selected' : ''}>Toggle</option>
          <option value="navigate" ${tap.action === 'navigate' ? 'selected' : ''}>Navigate</option>
          <option value="url" ${tap.action === 'url' ? 'selected' : ''}>Open URL</option>
          <option value="perform-action" ${tap.action === 'perform-action' ? 'selected' : ''}>Call service/action</option>
          <option value="none" ${tap.action === 'none' ? 'selected' : ''}>None</option>
        </select>
      </div>
      ${tap.action === 'navigate' ? `
      <div class="row">
        <label>Navigation path</label>
        <input type="text" data-tap-key="navigation_path" value="${tap.navigation_path || ''}" placeholder="/lovelace/weather">
      </div>` : ''}
      ${tap.action === 'url' ? `
      <div class="row">
        <label>URL</label>
        <input type="text" data-tap-key="url_path" value="${tap.url_path || ''}" placeholder="https://...">
      </div>` : ''}
      ${tap.action === 'perform-action' ? `
      <div class="row">
        <label>Service (domain.service)</label>
        <input type="text" data-tap-key="service" value="${tap.service || tap.perform_action || ''}" placeholder="light.turn_on">
      </div>` : ''}
      <div class="row">
        <label>Background images per weather condition</label>
        <div class="bg-images">
          ${Object.keys(CONDITION_ICONS).map((condition) => `
            <div class="bg-image-row">
              <ha-icon icon="${CONDITION_ICONS[condition]}"></ha-icon>
              <span class="bg-image-label">${condition}</span>
              <input
                type="text"
                data-condition="${condition}"
                placeholder="/local/backgrounds/weather/${condition}.jpg"
                value="${(() => {
                  const v = this._config.background_images && this._config.background_images[condition];
                  return Array.isArray(v) ? v.join(', ') : (v || '');
                })()}"
              >
            </div>
          `).join('')}
        </div>
        <div class="hint">Path or URL per weather condition. For multiple images (randomly picked on each condition change), enter several comma-separated paths, e.g. /local/.../sunny1.jpg, /local/.../sunny2.jpg. Leave empty to use the default image.</div>
      </div>
    `;

    this.querySelectorAll('ha-entity-picker').forEach((picker) => {
      const key = picker.getAttribute('data-config-key');
      picker.hass = this._hass;
      picker.value = this._config[key] || '';
      if (key === 'entity') picker.includeDomains = ['weather'];
      picker.addEventListener('value-changed', (ev) => {
        this._config = { ...this._config, [key]: ev.detail.value };
        this._fireChanged();
      });
    });

    this.querySelectorAll('input[data-config-key]').forEach((input) => {
      input.addEventListener('change', (ev) => this._textChanged(ev));
    });

    this.querySelectorAll('input[data-condition]').forEach((input) => {
      input.addEventListener('change', (ev) => this._backgroundImageChanged(ev));
    });

    this.querySelectorAll('[data-tap-key]').forEach((el) => {
      el.addEventListener('change', (ev) => this._tapActionFieldChanged(ev));
    });

    this._rendered = true;
  }
}

customElements.define('magis-weather-card-editor', MagisWeatherCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'magis-weather-card',
  name: 'MagIS Weather Card',
  description: 'A weather card inspired by the Weawow Weather App: dynamic background image, time, warning icon, hourly and daily forecast.',
});
