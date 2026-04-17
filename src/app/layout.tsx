import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Transmit Search Engine',
  description: 'Autonomous Talent Intelligence — find the world\'s top tech talent',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </head>
      <body style={{ margin: 0, background: '#0f1629', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
