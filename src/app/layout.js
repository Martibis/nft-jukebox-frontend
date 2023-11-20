import './globals.scss'
import MetamaskProvider from '@/providers/MetamaskProvider'

export const metadata = {
  metadataBase: new URL('https://nftjukebox.app'),
  title: 'Jukebox',
  description: 'Show off NFTs and earn $JUKE.',
  twitter: {
    card: 'summary_large_image',
    title: 'JukeBox',
    description: 'Show off NFTs and earn $JUKE.',
    creator: '@ShaikTibout'
  },
}

export default function RootLayout({ children }) {
  return (

    <html lang="en">
      <body className='App theme-dark'>
        <MetamaskProvider>
          {children}
        </MetamaskProvider>
      </body>
    </html>
  )
}
