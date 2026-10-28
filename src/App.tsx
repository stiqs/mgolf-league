import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import League from './pages/League'
import Upload from './pages/Upload'
import Verify from './pages/Verify'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/l/:slug" element={<League />} />
      <Route path="/upload/:weekId/:round" element={<Upload />} />
      <Route path="/verify/:id" element={<Verify />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}