"use client";
import JukeBoxInterface from "@/components/JukeBoxInterface";
import "./page.scss";
import Header from "@/components/Header";
import FooterBar from "@/components/FooterBar";

const Home = () => {
  return (
    <div id="home-page">
      <Header />
      <div className="above-fold">
        <JukeBoxInterface />
      </div>
      <FooterBar />
    </div>
  );
};

export default Home;
