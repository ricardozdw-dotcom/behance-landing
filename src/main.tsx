import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/bebas-neue/400.css'
import App from './App.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
