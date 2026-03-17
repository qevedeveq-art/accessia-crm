import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SENSIA Manager',
  description: 'Gestion clients, projets & CRM — SENSIA DVZ',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="ml-[var(--sidebar-width)] flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
