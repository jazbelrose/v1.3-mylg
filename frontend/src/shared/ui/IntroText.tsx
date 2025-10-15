import React, { useState, useEffect, useRef } from "react";
import "./intro-text.css";
import introtext from "./introtext.json";
import ScrambleText from "scramble-text";

function shuffle<T>(array: T[]): void {
  let currentIndex = array.length;
  let temporaryValue: T;
  let randomIndex: number;

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
}

export const Introtext: React.FC = () => {
  const [randomIntro, setRandomIntro] = useState("");
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    shuffle(introtext.introtext);
    setRandomIntro(
      introtext.introtext[Math.floor(Math.random() * introtext.introtext.length)]
    );
  }, []);

  useEffect(() => {
    const scrambleText = new (ScrambleText as unknown as new (element: HTMLElement, options: { timeOffset: number; chars: string[]; callback: () => void }) => { start: () => void })(textRef.current, {
      timeOffset: 5,
      chars: ["0", "|"],
      callback: function () {
        console.log("ended");
      },
    });
    scrambleText.start();
  }, [randomIntro]);

  return (
    <div className="introtext">
      <p ref={textRef} className="description">
        {randomIntro}
      </p>
    </div>
  );
};









