import { mount } from 'svelte';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/600.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { bootDeps } from './lib/boot.ts';
import { TimeStore } from './lib/store.svelte.ts';

const store = new TimeStore(await bootDeps());
mount(App, { target: document.getElementById('app')!, props: { store } });
void store.start();
