# Map style for Windy

A [Windy.com](https://www.windy.com) plugin that changes the basemap: land and sea fill, and the colour and thickness of coastlines, borders, rivers and streams, plus place-name labels.

Windy draws those in three different places, and an earlier version of this plugin missed all three:

- Land and sea fill is a WebGL shader with the colours written into the program, so a normal map paint property never reaches it.
- Coastlines, borders, rivers and streams are drawn together in one image that Windy decodes once and keeps in memory. Recolouring later downloads does nothing until those cached images are dropped. The plugin separates those lines by how strong they are.
- Place names are HTML text, not pixels in a tile.

Picking a colour now updates the part of the map that colour belongs to. Settings are saved in the browser.

Radar and satellite share their symbols: the lightning bolt, the snowflake, and the hail mark. Rain, thunder is a separate layer, with its own repeating rain marks and thunder marks. Choose a picture for any of those, then switch that layer off and on. The picture is used as the shape, and Windy still colours it.

## Risk overlays

The Risk section draws one overlay at a time: general convective risk, tornado risk, large hail, damaging winds, predicted hail size, and thunderstorm chance. Paste a tile address that contains `{z}`, `{x}`, and `{y}`. `{product}` is replaced with the product id (`convective`, `tornado`, `largeHail`, `damagingWinds`, `hailSize`, or `thunder`).

Tiles are 256×256 PNGs. A fully transparent pixel is no data. Every other pixel is opaque, and red and green store the number as `(red × 256 + green) ÷ 65535 × maximum`. The maximum is 100 for the percent products. For hail size it is the highest colour-scale stop, in millimetres. The readout can show that size in millimetres, centimetres, or inches.

A colour scale is a JSON file:

```json
{ "stops": [{ "value": 0, "color": "#e8f5e9" }, { "value": 12.4, "color": "#f9a825" }, { "value": 100, "color": "#b71c1c" }] }
```

Stops use the product’s own unit: percent, or millimetres for hail size. Import replaces the scale for the product that is selected. Save scale writes the same file back. The tile server has to allow the browser to read the images.

## Run it

```bash
npm install
npm start
```

Then open <https://www.windy.com/developer-mode> and load:

```text
https://localhost:9999/plugin.js
```

The dev server uses a self-signed certificate for `localhost`. The first time you open the plugin URL, the browser warns you. Choose **Advanced**, then **Proceed to localhost**. If that link is not there, click the warning page and type `thisisunsafe`.

Windy loads that file from `https://www.windy.com`, so the server also allows local-network access. If Chrome asks whether Windy can connect to devices on your local network, choose **Allow**. The address in developer mode must be exactly `https://localhost:9999/plugin.js`.

`npm test` checks the recolour rules, the weather-symbol packing, and the risk colour scales. `npm run build` writes `dist/plugin.js`.
