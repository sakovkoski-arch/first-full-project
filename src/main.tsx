import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('The application root element was not found')

createRoot(rootElement).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: '#24271f',
          colorPrimaryActive: '#171913',
          colorPrimaryHover: '#36392f',
          controlHeight: 38,
          fontFamily: "'DM Sans', sans-serif",
        },
        components: {
          Button: {
            defaultActiveBg: '#e9eadf',
            defaultActiveBorderColor: 'transparent',
            defaultActiveColor: '#292c24',
            defaultBg: '#f2f3ee',
            defaultBorderColor: 'transparent',
            defaultColor: '#34372e',
            defaultHoverBg: '#e9eadf',
            defaultHoverBorderColor: 'transparent',
            defaultHoverColor: '#292c24',
            defaultShadow: 'none',
            fontWeight: 700,
            primaryShadow: 'none',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
