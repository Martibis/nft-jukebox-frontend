"use client"
import JukeBoxInterface from '@/components/JukeBoxInterface'
import './page.scss'
import PlayButton from '@/components/PlayButton'

const Home = () => {

    return (
        <div id="home-page">
            <div className='above-fold'>
                <JukeBoxInterface />
                <PlayButton />
            </div>
        </div>
    )
}

export default Home