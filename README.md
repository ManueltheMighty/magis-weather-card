# MagIS Weather Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)

A standalone Home Assistant Lovelace custom card inspired by the Weawow Weather App:
a dynamic background image based on the current weather condition, the current
time instead of a location name, a warning icon when a weather alert is active,
and both hourly and daily forecasts – all in a single card, no `card_mod` required.

![Screenshot](docs/screenshot.png)

## Installation

### Via HACS (recommended)

1. Open HACS -> Frontend
2. Three dots top right -> **Custom repositories**
3. Enter the repository URL: `https://github.com/<your-github-name>/magis-weather-card`
   Category: **Dashboard**
4. Install "MagIS Weather Card"
5. Reload Home Assistant (hard refresh the browser, `Ctrl`+`Shift`+`R`)

### Manual

1. Copy `magis-weather-card.js` to `/config/www/magis-weather-card.js`
2. Settings -> Dashboards -> three dots top right -> **Resources**
   -> Add resource -> URL: `/local/magis-weather-card.js` -> Type: **JavaScript Module**
3. Clear your browser cache

## Usage

Add the card to your dashboard, either via the visual editor
(Add card -> search for "MagIS Weather Card") or via YAML:

```yaml
type: custom:magis-weather-card
entity: weather.home
warning_entity: sensor.current_warning_level
advance_warning_entity: sensor.advance_warning_level
default_background: /local/backgrounds/weather/default.jpg
forecast_slots_hourly: 8
forecast_slots_daily: 7
text_icon_shadow: true
tap_action:
  action: more-info
background_images:
  sunny: /local/backgrounds/weather/sunny.jpg
  clear-night: /local/backgrounds/weather/clearnight.jpg
  cloudy: /local/backgrounds/weather/cloudy.jpg
  partlycloudy: /local/backgrounds/weather/partlycloudy.jpg
  rainy:
    - /local/backgrounds/weather/rainy1.jpg
    - /local/backgrounds/weather/rainy2.jpg
  pouring: /local/backgrounds/weather/rainy.jpg
  snowy: /local/backgrounds/weather/snowy.jpg
  snowy-rainy: /local/backgrounds/weather/snowy-rainy.jpg
  fog: /local/backgrounds/weather/fog.jpg
  windy: /local/backgrounds/weather/stormy.jpg
  hail: /local/backgrounds/weather/stormy.jpg
  lightning: /local/backgrounds/weather/lightning.jpg
  lightning-rainy: /local/backgrounds/weather/stormy.jpg
```

## Configuration options

| Option                     | Type              | Required | Default  | Description                                                                   |
| --------------------------- | ---------------- | -------- | -------- | ------------------------------------------------------------------------------- |
| `entity`                    | string           | yes      | –        | Weather entity (`weather.xxx`)                                                  |
| `warning_entity`             | string           | no       | –        | Entity holding the current warning level (0 = no warning, 1-4 = warning level)  |
| `advance_warning_entity`     | string           | no       | –        | Entity holding the advance warning level                                        |
| `default_background`        | string            | no       | –        | Background image used when no image is set for the current condition           |
| `background_images`          | map              | no       | `{}`     | Weather condition -> image path (string) or multiple image paths (array, see below) |
| `forecast_slots_hourly`      | number            | no       | `8`      | Number of hours shown in the hourly forecast                                    |
| `forecast_slots_daily`       | number            | no       | `7`      | Number of days shown in the daily forecast                                      |
| `text_icon_shadow`           | boolean           | no       | `true`   | Drop shadow on text and icons for better readability                            |
| `tap_action`                  | object            | no       | `{action: more-info}` | Action triggered when the card is tapped (see below)               |

### Multiple background images per weather condition

Instead of a single path, a list can be provided per condition. The card
then picks one at random – the choice stays stable until the weather
condition changes (no flicker on every card update):

```yaml
background_images:
  sunny:
    - /local/backgrounds/weather/sunny1.jpg
    - /local/backgrounds/weather/sunny2.jpg
    - /local/backgrounds/weather/sunny3.jpg
```

In the visual editor: enter multiple comma-separated paths in the same field.

### Tap action

Tapping/clicking the card can trigger an action – configurable via the
visual editor or YAML:

```yaml
tap_action:
  action: more-info   # more-info | toggle | navigate | url | perform-action | none
  # depending on the action, add:
  # navigation_path: /lovelace/weather
  # url_path: https://example.com
  # service: light.turn_on
  # data: {}
  # target: {entity_id: light.living_room}
```

## Background image sources

A few ways to get more/varying background images:

- **Your own collection + random pick (see above):** the simplest option,
  fully offline, no external dependencies.
- **Store images on your NAS/`www` folder, multiple per condition:** exactly
  what the `background_images` array option covers – just drop several
  files into `/config/www/backgrounds/weather/<condition>/` and list the
  paths in the configuration.
- **Free weather/landscape images via an API (e.g. Unsplash, Pexels):**
  technically possible, but with caveats: it needs a (free) API key, requests
  are subject to rate limits, and the key would be visible in the browser
  since the card runs client-side. Not included in this version, but
  conceivable as an extension.
- **Automatic folder listing via Home Assistant's media source
  (`media_source`):** would let you simply drop files into a folder without
  editing the card configuration each time. More involved to implement
  (requires configured `media_dirs`) and also not included in this version.

## Development / Contributing

Issues and pull requests are welcome. For releases: create a git tag in the
format `vX.Y.Z` and turn it into a GitHub release – HACS detects new
versions from releases.

## License

MIT
