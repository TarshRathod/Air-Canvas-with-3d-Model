import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import DrawingCanvas from './components/Draw/Draw.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DrawingCanvas />
  </StrictMode>,
)
