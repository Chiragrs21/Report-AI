import React from 'react'
import Signup from "./components/auth/Signup"
import { Routes, Route } from 'react-router-dom'
import Page from "./components/Main"

const App = () => {
  return (
    <div>
      <Routes>
        <Route path='/login' element={<Signup />} />
        <Route path='/' element={<Page />} />
      </Routes>

    </div>
  )
}

export default App
