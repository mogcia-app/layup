import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Layup -',
  description: 'AIで振り返る、ゴルフのPDCA',
  icons: {
    icon: '/layup-1.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

