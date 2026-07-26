import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Jukebox — the on-chain stage. Play any NFT, earn $JUKE.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0B0B0C',
          color: '#ECE9E2',
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
            color: 'rgba(236,233,226,0.55)',
          }}
        >
          <div style={{ display: 'flex' }}>AN EXHIBITION PROTOCOL</div>
          <div style={{ display: 'flex' }}>ETHEREUM MAINNET</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
          {/* Protocol mark: vermilion disc */}
          <div
            style={{
              width: 132,
              height: 132,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FF4A1E',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: '#0B0B0C',
              }}
            />
          </div>
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
            borderTop: '1px solid rgba(236,233,226,0.25)',
            paddingTop: 28,
            fontSize: 26,
            color: 'rgba(236,233,226,0.75)',
            letterSpacing: 1,
          }}
        >
          <div style={{ display: 'flex' }}>
            One NFT on stage at a time, for everyone to see.
          </div>
          <div style={{ display: 'flex', color: '#FF4A1E' }}>
            120 $JUKE / block
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
