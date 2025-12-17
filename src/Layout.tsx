import React from 'react'
import ReactDOM from 'react-dom/client'
import Page from './page'
import './index.css'

function Layout() {
  return <Page />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Layout />
  </React.StrictMode>,
)

