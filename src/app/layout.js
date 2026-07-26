import './globals.scss'
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import MetamaskProvider from '@/providers/MetamaskProvider'
import faqs from '@/data/faq'

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

const siteUrl = 'https://nftjukebox.app'
const siteName = 'NFT Jukebox'
const siteDescription =
  'Jukebox is an autonomous exhibition protocol on Ethereum. One NFT is on stage at a time, visible to everyone — any NFT, played by anyone. Every block it stays up earns 120 $JUKE for the player who put it there.'

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'NFT Jukebox — The On-Chain Stage. Play Any NFT, Earn $JUKE.',
    template: '%s · NFT Jukebox',
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    'NFT jukebox',
    'exhibition protocol',
    'NFT',
    'Ethereum',
    '$JUKE',
    'JUKE token',
    'on-chain art',
    'ERC-20',
    'ERC-721',
    'web3',
    'earn crypto',
    'NFT display',
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  category: 'web3',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName,
    title: 'NFT Jukebox — The On-Chain Stage. Play Any NFT, Earn $JUKE.',
    description: siteDescription,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NFT Jukebox — The On-Chain Stage. Play Any NFT, Earn $JUKE.',
    description: siteDescription,
    creator: '@ShaikTibout',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0B0C',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
    },
    {
      '@type': 'WebApplication',
      '@id': `${siteUrl}/#app`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires a web3 wallet such as MetaMask',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${spaceGrotesk.variable} ${plexMono.variable}`}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <MetamaskProvider>
          {children}
        </MetamaskProvider>
      </body>
    </html>
  )
}
