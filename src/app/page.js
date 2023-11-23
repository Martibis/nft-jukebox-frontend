"use client"
import JukeBoxInterface from '@/components/JukeBoxInterface'
import './page.scss'
import PlayButton from '@/components/PlayButton'

const Home = () => {

    return (
        <div id="home-page">
            {/* <div className='header'>
                <h1>Welcome to the $JUKEBOX</h1>
            </div> */}
            <JukeBoxInterface />
            <PlayButton />
        </div>
    )
}

export default Home