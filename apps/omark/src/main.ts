import { mount } from 'svelte';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
// The design tokens and base styles are Tasks' for now; they become the suite's in U.5.
import 'tasks/src/styles/tokens.css';
import 'tasks/src/styles/base.css';
import Shell from './Shell.svelte';

mount(Shell, { target: document.getElementById('app')! });
