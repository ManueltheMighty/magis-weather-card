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
| `warning_entity`             | string           | no       | –        | Entity holding the current warning level (0 = no warning, 1-4 = warning level). If the entity has a `warning_1_name` or `warning_1_headline` attribute (e.g. the DWD Weather Warnings integration), its short description (e.g. "Thunderstorm", "Heavy rain") is shown next to the icon |
| `advance_warning_entity`     | string           | no       | –        | Entity holding the advance warning level (same attribute support as above)      |
| `theme`                     | string           | no       | –        | Name of a Home Assistant theme. If set, the background is taken from that theme (see below); `background_images` / `default_background` act as fallback |
| `theme_background_variable`  | string           | no       | `lovelace-background` | CSS variable of the theme that holds the background (without the leading `--`) |
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

## Background from a Home Assistant theme

Instead of listing image URLs per weather condition, you can point the card
at a Home Assistant theme and let the theme decide which background to show
(for example by weather, time of day or season):

```yaml
type: custom:magis-weather-card
entity: weather.home
theme: my_weather_theme
# theme_background_variable: lovelace-background   # default
```

How it works: the card reads the theme's value for the configured CSS
variable (`lovelace-background` by default; light/dark `modes` are respected),
and uses the `url(...)` in it. If the theme is the one currently active, its
variables are already available; otherwise the card applies just that one
variable to itself. If the theme provides no usable value, the card falls
back to `background_images` / `default_background`.

Limits: the value must contain a plain `url(...)` or a path (images and
videos both work). Gradients and plain colors are ignored. The theme must
expose the background as a CSS variable; a background that is only applied
through `card_mod` CSS rules is not visible to the card.

## Security notes

- Background URLs (from the config, from a theme or from a sensor-driven
  theme) are only accepted as plain `http(s)` or relative paths without
  quotes, spaces, parentheses or angle brackets. Anything else (for example
  `javascript:` or `data:` URLs, or values that try to break out of the CSS)
  is ignored.
- Text that comes from entity attributes (for example the warning name) is
  HTML-escaped before it is rendered.
- `tap_action: url` only opens `http(s)`/relative URLs and uses
  `noopener,noreferrer` for new tabs; `navigate` only accepts paths inside
  Home Assistant (starting with a single `/`).
- Background images/videos are loaded from the URLs you configure, so only
  point the card at sources you trust.

## Video backgrounds

Any background entry (`default_background`, or an entry in `background_images`,
including inside an array of multiple options) can be a video file instead of
an image. Supported extensions: `.mp4`, `.webm`, `.mov`, `.m4v`. Detection is
automatic based on the file extension, no extra config needed:

```yaml
background_images:
  rainy: /local/backgrounds/weather/rainy.mp4
```

The video plays muted, looped, and inline (required for autoplay in browsers).
Keep in mind: video files are much larger than images, and continuous
looping playback uses more CPU/GPU than a static image — this matters
especially on lower-powered wallboards/tablets.

## German condition names

Standard Home Assistant weather entities report their condition using fixed
English slugs (`sunny`, `cloudy`, `rainy`, ...), but some integrations or
template/custom entities report German terms instead (`sonnig`, `bewölkt`,
`regnerisch`, ...). The card automatically translates a number of common
German condition names to the matching standard slug before looking up the
icon and background image, so `background_images` always uses the English
keys shown above regardless of which one your entity reports. If your
entity uses a German term that isn't recognized yet, open an issue or add
it to the `GERMAN_CONDITION_ALIASES` map near the top of the file.

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
