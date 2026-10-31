import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-map-style',
    version: '0.1.14',
    private: false,
    icon: '🎨',
    title: 'Map style',
    description:
        'Change the colour and thickness of coastlines, borders, rivers and streams, swap weather symbols, and draw risk overlays with your own colour scales. Settings are saved in your browser.',
    author: 'Weather in 2D',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/map-style',
};

export default config;
