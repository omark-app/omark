import { mount } from 'svelte';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { APP_ENV, LOOK } from './env.ts';
import { applyLook } from './lib/environment.ts';
import { applyIcons, iconsFor } from './lib/icons.ts';

applyLook(LOOK, document);
const icons = iconsFor(APP_ENV);
if (icons) applyIcons(icons, document);

mount(App, { target: document.getElementById('app')! });
