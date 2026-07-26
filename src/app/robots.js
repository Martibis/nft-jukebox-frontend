export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: 'https://nftjukebox.app/sitemap.xml',
  }
}
