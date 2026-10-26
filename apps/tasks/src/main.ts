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
import { LOOK } from './env.ts';
import { applyLook } from './lib/environment.ts';

applyLook(LOOK, document);

mount(App, { target: document.getElementById('app')! });
