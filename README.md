# Map style for Windy

A [Windy.com](https://www.windy.com) plugin that changes the colour of the basemap: land and sea fill, coastlines and borders, and place-name labels.

Windy draws those in three different places, and an earlier version of this plugin missed all three:

- Land and sea fill is a WebGL shader with the colours written into the program, so a normal map paint property never reaches it.
- Coastlines and borders are images that Windy decodes once and keeps in memory. Recolouring later downloads does nothing until those cached images are dropped.
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

The dev server uses the certificate from `@windycom/plugin-devtools`. Accept it in the browser if you are asked to.

`npm test` checks the recolour rules. `npm run build` writes `dist/plugin.js`.
