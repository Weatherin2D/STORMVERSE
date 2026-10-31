import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-map-style',
    version: '0.1.10',
    private: false,
    icon: '🎨',
    title: 'Map style',
    description:
        'Change the colour and thickness of coastlines, borders, rivers and streams, and swap the radar, satellite, rain and thunder symbols. Settings are saved in your browser.',
    author: 'Weather in 2D',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/map-style',
};

export default config;
