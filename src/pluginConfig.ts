import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-map-style',
    version: '0.1.9',
    private: false,
    icon: '🎨',
    title: 'Map style',
    description:
        'Change the colour and thickness of coastlines, borders, rivers and streams separately, plus labels and the background. Settings are saved in your browser.',
    author: 'Weather in 2D',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/map-style',
};

export default config;
