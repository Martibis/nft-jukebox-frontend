import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'NFT Jukebox — the on-chain stage. Play any NFT, earn $JUKE.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The share card shows whatever is on stage right now. Crawlers re-scrape
// periodically (and per-post on most platforms), so previews track the
// exhibition instead of showing a frozen logo card.

// Overridable so the card can be tested against a local server
const SITE_URL = process.env.SITE_URL || 'https://nftjukebox.app'
const BG = '#0B0B0C'
const INK = '#ECE9E2'
const INK_55 = 'rgba(236,233,226,0.55)'
const INK_75 = 'rgba(236,233,226,0.75)'
const LINE = 'rgba(236,233,226,0.25)'
const ACCENT = '#FF4A1E'

const shortAddress = (value) =>
  value && value.startsWith('0x') && value.length > 12
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value

async function getSnapshot() {
  try {
    const response = await fetch(`${SITE_URL}/api/now-playing`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4_000),
    })
    if (!response.ok) return null
    return await response.json()
  } catch (_) {
    return null
  }
}

// A raster still the OG renderer can embed; SVG and data URIs are out.
function artworkUrl(snapshot) {
  const media = snapshot?.staticMedia
  if (
    !media?.origin ||
    !media.type?.startsWith('image/') ||
    media.type === 'image/svg+xml'
  ) {
    return null
  }
  return (
    `${SITE_URL}/api/thumb?url=` +
    encodeURIComponent(media.origin) +
    '&w=512&fmt=png'
  )
}

const Mark = ({ size: markSize }) => (
  <div
    style={{
      width: markSize,
      height: markSize,
      borderRadius: 999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ACCENT,
    }}
  >
    <div
      style={{
        width: markSize * 0.27,
        height: markSize * 0.27,
        borderRadius: 999,
        backgroundColor: BG,
      }}
    />
  </div>
)

const BrandCard = () => (
  <div
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: BG,
      color: INK,
      padding: '64px 72px',
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 22,
        letterSpacing: 6,
        color: INK_55,
      }}
    >
      <div style={{ display: 'flex' }}>AN EXHIBITION PROTOCOL</div>
      <div style={{ display: 'flex' }}>ETHEREUM MAINNET</div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
      <Mark size={132} />
      <div
        style={{
          display: 'flex',
          fontSize: 130,
          fontWeight: 600,
          letterSpacing: -3,
        }}
      >
        Jukebox
      </div>
    </div>

    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${LINE}`,
        paddingTop: 28,
        fontSize: 26,
        color: INK_75,
        letterSpacing: 1,
      }}
    >
      <div style={{ display: 'flex' }}>
        One NFT on stage at a time, for everyone to see.
      </div>
      <div style={{ display: 'flex', color: ACCENT }}>120 $JUKE / block</div>
    </div>
  </div>
)

const StageCard = ({ snapshot, art }) => {
  const rawName = snapshot.name || `Token #${snapshot.tokenId}`
  const name = rawName.length > 70 ? rawName.slice(0, 69) + '…' : rawName
  const player = shortAddress(snapshot.player) || '—'
  const blocksHeld =
    snapshot.currentBlock && snapshot.startBlock
      ? snapshot.currentBlock - snapshot.startBlock
      : null

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: BG,
        color: INK,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 56px 56px 64px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            fontSize: 22,
            letterSpacing: 6,
            color: INK_55,
          }}
        >
          <Mark size={44} />
          <div style={{ display: 'flex' }}>NFT JUKEBOX</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              letterSpacing: 6,
              color: ACCENT,
            }}
          >
            NOW ON STAGE
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 58,
              fontWeight: 600,
              letterSpacing: -1,
              lineHeight: 1.15,
            }}
          >
            {name}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: INK_75 }}>
            played by {player}
            {blocksHeld != null && blocksHeld >= 0
              ? ` · on view for ${blocksHeld.toLocaleString('en-US')} blocks`
              : ''}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${LINE}`,
            paddingTop: 24,
            fontSize: 23,
            letterSpacing: 1,
            color: INK_75,
          }}
        >
          <div style={{ display: 'flex' }}>Play any NFT, earn $JUKE</div>
          <div style={{ display: 'flex', color: ACCENT }}>nftjukebox.app</div>
        </div>
      </div>

      {art ? (
        <div
          style={{
            width: 470,
            height: '100%',
            display: 'flex',
            borderLeft: `1px solid ${LINE}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art}
            alt=""
            width={470}
            height={630}
            style={{ objectFit: 'cover' }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default async function OpengraphImage() {
  const snapshot = await getSnapshot()

  return new ImageResponse(
    snapshot?.tokenId != null ? (
      <StageCard snapshot={snapshot} art={artworkUrl(snapshot)} />
    ) : (
      <BrandCard />
    ),
    {
      ...size,
      headers: {
        'Cache-Control':
          'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
      },
    }
  )
}
