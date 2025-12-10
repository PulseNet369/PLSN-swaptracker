import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PulseX Tracker',
  description: 'Backend cron job',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
