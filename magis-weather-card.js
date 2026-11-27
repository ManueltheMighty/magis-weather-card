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
 * # theme: wetter_hintergrund        # optional: take the background from a HA theme
 * # theme_background_variable: magis-weather-background
 * # background_folder: /local/backgrounds/weather   # <folder>/<season>/<day|night>/<condition>.jpg
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
  'windy-variant': 'mdi:weather-windy-variant',
  'hail': 'mdi:weather-hail',
  'lightning': 'mdi:weather-lightning',
  'lightning-rainy': 'mdi:weather-lightning-rainy',
  'exceptional': 'mdi:alert-circle-outline',
};

// Some weather integrations (or template/custom entities) report the
// condition in German instead of the standard HA condition slugs. This
// maps common German terms to the standard slugs used above and in
// background_images, so both work regardless of which one your entity uses.
const GERMAN_CONDITION_ALIASES = {
  'sonnig': 'sunny',
  'klar': 'sunny',
  'klare nacht': 'clear-night',
  'wolkenlos': 'clear-night',
  'bewölkt': 'cloudy',
  'bewoelkt': 'cloudy',
  'bedeckt': 'cloudy',
  'stark bewölkt': 'cloudy',
  'stark bewoelkt': 'cloudy',
  'wolkig': 'partlycloudy',
  'teilweise bewölkt': 'partlycloudy',
  'teilweise bewoelkt': 'partlycloudy',
  'leicht bewölkt': 'partlycloudy',
  'leicht bewoelkt': 'partlycloudy',
  'regen': 'rainy',
  'regnerisch': 'rainy',
  'leichter regen': 'rainy',
  'schauer': 'rainy',
  'regenschauer': 'rainy',
  'starkregen': 'pouring',
  'heftiger regen': 'pouring',
  'schnee': 'snowy',
  'schneefall': 'snowy',
  'schneeschauer': 'snowy',
  'schneeregen': 'snowy-rainy',
  'nebel': 'fog',
  'neblig': 'fog',
  'dunst': 'fog',
  'windig': 'windy',
  'sturm': 'windy',
  'orkan': 'windy',
  'hagel': 'hail',
  'gewitter': 'lightning',
  'gewitter mit regen': 'lightning-rainy',
  'unwetter': 'lightning-rainy',
};

// Escapes text before it is placed into innerHTML. Entity attributes (for
// example warning names coming from an external service) are not trusted.
function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Accepts only plain http(s) or relative URLs without characters that could
// break out of a CSS url(...) or an HTML attribute. Returns '' otherwise.
function safeUrl(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (!v || /[\s"'()<>\\`]/.test(v) || /[\u0000-\u001f]/.test(v)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    return /^https?:\/\//i.test(v) ? v : '';
  }
  if (v.startsWith('//')) return '';
  return v;
}

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
    if (this._themeVarsApplied) {
      this._themeVarsApplied.forEach((v) => this.style.removeProperty(v));
      this._themeVarsApplied = null;
    }
    this._themeWarned = null;
    this._lastThemeUrls = null;
    this._themeRetries = 0;
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
        if (typeof actionConfig.navigation_path === 'string' && /^\/(?!\/)/.test(actionConfig.navigation_path)) {
          window.history.pushState(null, '', actionConfig.navigation_path);
          this.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
        }
        break;

      case 'url': {
        const target = safeUrl(actionConfig.url_path);
        if (target) {
          if (actionConfig.new_tab === false) {
            window.open(target, '_self');
          } else {
            window.open(target, '_blank', 'noopener,noreferrer');
          }
        }
        break;
      }

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
    if (this._themeRetryTimer) {
      clearTimeout(this._themeRetryTimer);
      this._themeRetryTimer = null;
    }
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

  // Lowercases and maps German condition names to the standard slug.
  // Unknown values pass through unchanged (so standard English slugs
  // keep working as before).
  _normalizeCondition(condition) {
    if (!condition) return '';
    const key = String(condition).trim().toLowerCase();
    return GERMAN_CONDITION_ALIASES[key] || key;
  }

  // Lets a background entry be either an image or a video (mp4/webm/mov/m4v),
  // detected purely by file extension -- no separate config needed.
  _isVideo(path) {
    return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(path || '');
  }

  _conditionIcon(condition) {
    const normalized = this._normalizeCondition(condition);
    return CONDITION_ICONS[normalized] || 'mdi:weather-cloudy';
  }

  // Reads the background from a Home Assistant theme (config: theme).
  // The named theme's value for the configured CSS variable is applied to
  // this card (limited to this one variable), then read back via computed
  // style, so var() references resolve and light/dark modes are respected.
  // Every url(...) in the value that passes safeUrl() is used (several
  // entries are stacked as layers, later ones act as fallbacks for missing
  // files); gradients/colors are ignored.
  // The variable may also be declared by the theme on an ancestor element
  // (for example via card-mod on the view); it is then inherited. NOTE: such
  // a variable only exists inside the views that rule applies to.
  // Without theme_background_variable the card tries
  // --magis-weather-background first, then --lovelace-background.
  _themeVariableNames() {
    const configured = this.config.theme_background_variable;
    const list = configured ? [configured] : ['magis-weather-background', 'lovelace-background'];
    return list
      .map((n) => String(n).trim().replace(/^--/, ''))
      .filter((n) => /^[A-Za-z0-9_-]+$/.test(n));
  }

  _themeBackgroundFor(name) {
    const cssVar = '--' + name;
    const themes = this._hass.themes && this._hass.themes.themes;
    const def = themes && themes[this.config.theme];
    if (def) {
      let value = def[name];
      const modeDef = def.modes && def.modes[this._hass.themes.darkMode ? 'dark' : 'light'];
      if (modeDef && modeDef[name] !== undefined) value = modeDef[name];
      if (typeof value === 'string' || typeof value === 'number') {
        this.style.setProperty(cssVar, String(value));
        this._themeVarsApplied = this._themeVarsApplied || new Set();
        this._themeVarsApplied.add(cssVar);
      } else {
        this.style.removeProperty(cssVar);
      }
    }

    const computed = String(getComputedStyle(this).getPropertyValue(cssVar) || '').trim();
    if (!computed) return [];
    const urls = [];
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = re.exec(computed)) !== null && urls.length < 8) {
      const u = safeUrl(m[2].trim());
      if (u) urls.push(u);
    }
    if (!urls.length && !/url\(/i.test(computed)) {
      const bare = safeUrl(computed);
      if (bare) urls.push(bare);
    }
    return urls;
  }

  _themeBackgrounds() {
    if ((!this.config.theme && !this.config.theme_background_variable) || !this._hass) return [];
    for (const name of this._themeVariableNames()) {
      const urls = this._themeBackgroundFor(name);
      if (urls.length) {
        this._themeWarned = null;
        this._themeRetries = 0;
        this._lastThemeUrls = urls;
        return urls;
      }
    }
    // The variable can disappear for a moment (for example while card-mod
    // re-applies its style): keep the last known background instead of
    // switching to an empty card.
    if (this._lastThemeUrls && this._lastThemeUrls.length) return this._lastThemeUrls;
    if (this._scheduleThemeRetry()) return [];
    this._warnThemeEmpty();
    return [];
  }

  // card-mod renders its template asynchronously, so the variable can show up
  // a moment after the first render: look again a few times before warning.
  // Returns true while a retry is pending or was just scheduled.
  _scheduleThemeRetry() {
    const delays = [400, 1200, 3000, 6000];
    if (this._themeRetryTimer) return true;
    const n = this._themeRetries || 0;
    if (n >= delays.length) return false;
    this._themeRetries = n + 1;
    this._themeRetryTimer = setTimeout(() => {
      this._themeRetryTimer = null;
      this._render();
    }, delays[n]);
    return true;
  }

  // One console hint (per situation) when a theme is configured but gives
  // no background, so the cause can be found without guessing.
  _warnThemeEmpty() {
    const themes = this._hass.themes || {};
    const names = this._themeVariableNames();
    const key = [this.config.theme, names.join(','), themes.theme].join('|');
    if (this._themeWarned === key) return;
    this._themeWarned = key;
    const known = !!(themes.themes && themes.themes[this.config.theme]);
    console.warn(
      'MagIS Weather Card: ' + (this.config.theme ? 'theme "' + this.config.theme + '"' : 'the configured CSS variable') + ' provided no background. ' +
      'CSS variable(s) ' + names.map((n) => '--' + n).join(', ') + ' are empty on this card. ' +
      'Active theme: "' + themes.theme + '"; theme known to Home Assistant: ' + known + '. ' +
      'The variable must be declared by the active theme in the view that contains this card ' +
      '(for example via card-mod-view). Falling back to background_folder / background_images.'
    );
  }

  _now() {
    return new Date();
  }

  // All rendering goes into one container inside the shadow root. Other nodes
  // in the shadow root (for example the <style> that card-mod injects for
  // `card_mod: style:`) are left untouched when the card re-renders.
  _root() {
    if (!this._rootEl) {
      this._rootEl = document.createElement('div');
      this._rootEl.style.display = 'contents';
      this.shadowRoot.appendChild(this._rootEl);
    }
    return this._rootEl;
  }

  _isNight() {
    const sun = this._hass && this._hass.states && this._hass.states['sun.sun'];
    if (sun && sun.state) return sun.state === 'below_horizon';
    const h = this._now().getHours();
    return h < 6 || h >= 20;
  }

  // winter / spring / summer / autumn, flipped automatically when the
  // Home Assistant location is in the southern hemisphere.
  _season() {
    let m = this._now().getMonth() + 1;
    const lat = this._hass && this._hass.config && this._hass.config.latitude;
    if (typeof lat === 'number' && lat < 0) m = ((m + 5) % 12) + 1;
    if (m === 12 || m <= 2) return 'winter';
    if (m <= 5) return 'spring';
    if (m <= 8) return 'summer';
    return 'autumn';
  }

  // Folder mode (config: background_folder). Builds stacked layers, most
  // specific first; the browser shows the first file that exists:
  //   <folder>/<season>/<day|night>/<condition>.jpg
  //   <folder>/<day|night>/<condition>.jpg
  //   <folder>/<season>/<condition>.jpg
  //   <folder>/<condition>.jpg
  // The condition only ever comes from a fixed list, so entity text can
  // never end up in a path.
  _folderBackgrounds(condition) {
    const base = safeUrl(String(this.config.background_folder || '').trim().replace(/\/+$/, ''));
    if (!base) return [];
    const ext = /^[a-z0-9]{2,5}$/i.test(String(this.config.background_folder_extension || ''))
      ? String(this.config.background_folder_extension).toLowerCase()
      : 'jpg';
    const tod = this._isNight() ? 'night' : 'day';
    let w = this._normalizeCondition(condition);
    if (tod === 'night' && w === 'sunny') w = 'clear-night';
    else if (tod === 'day' && w === 'clear-night') w = 'sunny';
    if (!Object.prototype.hasOwnProperty.call(CONDITION_ICONS, w)) return [];
    const season = this._season();
    return [
      `${base}/${season}/${tod}/${w}.${ext}`,
      `${base}/${tod}/${w}.${ext}`,
      `${base}/${season}/${w}.${ext}`,
      `${base}/${w}.${ext}`,
    ].map(safeUrl).filter(Boolean);
  }

  _background(condition) {
    const themed = this._themeBackgrounds();
    if (themed.length) {
      // A video cannot be a CSS background layer: if the first entry is a
      // video it is used alone, otherwise only the image layers are stacked.
      this._bgLayers = this._isVideo(themed[0]) ? [themed[0]] : themed.filter((u) => !this._isVideo(u));
      return this._bgLayers[0];
    }

    const folder = this._folderBackgrounds(condition);
    if (folder.length) {
      const fallback = safeUrl(this.config.default_background);
      this._bgLayers = fallback && !this._isVideo(fallback) ? folder.concat([fallback]) : folder;
      return this._bgLayers[0];
    }

    const normalized = this._normalizeCondition(condition);
    const raw = (this.config.background_images && this.config.background_images[normalized])
      || this.config.default_background
      || '';
    // Accepts either a single path (string) or multiple paths (array) per
    // weather condition. With multiple, one is picked at random and kept
    // until the condition changes (avoids flicker on every 30s redraw
    // triggered by the clock).
    const list = (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map(safeUrl).filter(Boolean);
    if (!list.length) {
      this._bgLayers = [];
      return '';
    }
    if (this._bgCondition !== normalized || !this._bgCurrent || !list.includes(this._bgCurrent)) {
      this._bgCondition = normalized;
      this._bgCurrent = list[Math.floor(Math.random() * list.length)];
    }
    this._bgLayers = [this._bgCurrent];
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
      this._root().innerHTML = `<ha-card><div style="padding:16px;">Entity ${escapeHtml(this.config.entity)} not found.</div></ha-card>`;
      return;
    }

    const condition = stateObj.state;
    const temp = stateObj.attributes.temperature;
    const windSpeed = stateObj.attributes.wind_speed;
    const windUnit = stateObj.attributes.wind_speed_unit || '';
    const bg = this._background(condition);
    const bgIsVideo = this._isVideo(bg);
    // Keep a reference to a currently-playing background video (if any)
    // before the DOM gets rebuilt below, so we can re-attach the same
    // element afterwards instead of restarting playback on every redraw
    // (the clock alone triggers a redraw every 30s).
    const previousVideo = this._root().querySelector('video.bg-video');
    const previousVideoSrc = previousVideo ? previousVideo.currentSrc : null;
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
          ${currentWarnInfo.name ? `<span>${escapeHtml(currentWarnInfo.name)}</span>` : ''}
        </div>`;
    } else if (advanceWarnInfo.level > 0) {
      warningHtml = `
        <div class="warning-info" title="Advance warning (level ${advanceWarnInfo.level})">
          <ha-icon icon="mdi:alert-outline" style="color:rgba(255,255,255,0.6)"></ha-icon>
          ${advanceWarnInfo.name ? `<span>${escapeHtml(advanceWarnInfo.name)}</span>` : ''}
        </div>`;
    }

    const windHtml = windSpeed !== undefined
      ? `<div class="wind-row"><ha-icon icon="mdi:windsock"></ha-icon><span>${Math.round(windSpeed)} ${escapeHtml(windUnit)}</span></div>`
      : '';

    // Text/icon shadow -- toggled from the editor (text_icon_shadow).
    // Adjust strength here (blur radius / opacity).
    const shadowEnabled = this.config.text_icon_shadow !== false;
    const textShadowCss = shadowEnabled ? '1px 1px 3px rgba(0,0,0,0.6)' : 'none';
    const iconShadowCss = shadowEnabled ? 'drop-shadow(1px 1px 2px rgba(0,0,0,0.6))' : 'none';

    this._root().innerHTML = `
      <style>
        ha-card {
          position: relative;
          overflow: hidden;
          border-radius: 15px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          background-image: ${!bgIsVideo && this._bgLayers && this._bgLayers.length ? this._bgLayers.map((u) => `url('${u}')`).join(', ') : 'none'};
          background-color: ${bg ? 'transparent' : 'var(--card-background-color)'};
          background-size: cover;
          background-position: center;
          color: #fff;
          /* Overall card height -- adjust here if it should be taller/shorter */
          min-height: 420px;
          cursor: ${this.config.tap_action && this.config.tap_action.action !== 'none' ? 'pointer' : 'default'};
        }
        .bg-video {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
        }
        .overlay {
          position: relative;
          z-index: 1;
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
        ${bgIsVideo ? `<video class="bg-video" autoplay muted loop playsinline src="${bg}"></video>` : ''}
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

    // Re-attach the already-playing video element if the source hasn't
    // actually changed, so it keeps playing smoothly instead of
    // restarting on every redraw.
    if (bgIsVideo && previousVideo && previousVideoSrc) {
      const newVideo = this._root().querySelector('video.bg-video');
      if (newVideo && previousVideoSrc === newVideo.currentSrc) {
        newVideo.replaceWith(previousVideo);
      }
    }
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
    const themeCount = hass && hass.themes && hass.themes.themes ? Object.keys(hass.themes.themes).length : 0;
    if (this._rendered && themeCount === (this._themeCountAtRender || 0)) {
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
    if (value === '' || value === undefined) {
      const next = { ...this._config };
      delete next[key];
      this._config = next;
    } else {
      this._config = { ...this._config, [key]: value };
    }
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
    const themes = (this._hass && this._hass.themes && this._hass.themes.themes) || {};
    const themeNames = Object.keys(themes).sort();
    this._themeCountAtRender = themeNames.length;
    if (this._config.theme && !themeNames.includes(this._config.theme)) themeNames.push(this._config.theme);
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
        <label>Theme (take the background from a Home Assistant theme instead of the images below)</label>
        <select data-config-key="theme">
          <option value="">None (use the images below)</option>
          ${themeNames.map((n) => `<option value="${escapeHtml(n)}" ${this._config.theme === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
        </select>
      </div>
      ${(this._config.theme || this._config.theme_background_variable) ? `
      <div class="row">
        <label>Theme background variable (CSS variable holding the background URL)</label>
        <input type="text" data-config-key="theme_background_variable" value="${escapeHtml(this._config.theme_background_variable || '')}" placeholder="lovelace-background">
        <div class="hint">Default: lovelace-background. The value must be a plain url(...) or path; gradients and colors are ignored. If the theme provides nothing, the images below are used as fallback.</div>
      </div>` : ''}
      <div class="row">
        <label>Background folder (automatic: season / day-night / condition)</label>
        <input type="text" data-config-key="background_folder" value="${escapeHtml(this._config.background_folder)}" placeholder="/local/backgrounds/weather">
        <div class="hint">Looks for &lt;folder&gt;/&lt;season&gt;/&lt;day|night&gt;/&lt;condition&gt;.jpg and falls back to &lt;folder&gt;/&lt;day|night&gt;/&lt;condition&gt;.jpg, &lt;folder&gt;/&lt;season&gt;/&lt;condition&gt;.jpg and &lt;folder&gt;/&lt;condition&gt;.jpg. Seasons: winter, spring, summer, autumn. Images only.</div>
      </div>
      <div class="row">
        <label>Default background image (default_background)</label>
        <input type="text" data-config-key="default_background" value="${escapeHtml(this._config.default_background)}">
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
        <input type="text" data-tap-key="navigation_path" value="${escapeHtml(tap.navigation_path)}" placeholder="/lovelace/weather">
      </div>` : ''}
      ${tap.action === 'url' ? `
      <div class="row">
        <label>URL</label>
        <input type="text" data-tap-key="url_path" value="${escapeHtml(tap.url_path)}" placeholder="https://...">
      </div>` : ''}
      ${tap.action === 'perform-action' ? `
      <div class="row">
        <label>Service (domain.service)</label>
        <input type="text" data-tap-key="service" value="${escapeHtml(tap.service || tap.perform_action)}" placeholder="light.turn_on">
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
                  return escapeHtml(Array.isArray(v) ? v.join(', ') : v);
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

    this.querySelectorAll('input[data-config-key], select[data-config-key]').forEach((input) => {
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
