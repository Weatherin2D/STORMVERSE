# Map style for Windy

A [Windy.com](https://www.windy.com) plugin that changes the basemap: land and sea fill, and the colour and thickness of coastlines, borders, rivers and streams, plus place-name labels.

Windy draws those in three different places, and an earlier version of this plugin missed all three:

- Land and sea fill is a WebGL shader with the colours written into the program, so a normal map paint property never reaches it.
- Coastlines, borders, rivers and streams are drawn together in one image that Windy decodes once and keeps in memory. Recolouring later downloads does nothing until those cached images are dropped. The plugin separates those lines by how strong they are.
- Place names are HTML text, not pixels in a tile.

Picking a colour now updates the part of the map that colour belongs to. Settings are saved in the browser.

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

`npm test` checks the recolour rules. `npm run build` writes `dist/plugin.js`.
