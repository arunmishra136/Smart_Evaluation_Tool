import React, { useState, useEffect } from "react";
import "./Loader.css";

const Loader: React.FC = () => {
  const messages = [
    "Evaluating brilliance...",
    "Crunching numbers...",
    "Analyzing answers...",
    "Generating insights...",
    "Almost there..."
  ];

  const [currentMessage, setCurrentMessage] = useState(messages[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextMessage = messages[Math.floor(Math.random() * messages.length)];
      setCurrentMessage(nextMessage);
    }, 1500); // change message every 1.5 seconds

    return () => clearInterval(interval); // cleanup on unmount
  }, []);

  return (
    <div className="loader-container">
      <div className="spinner"></div>
      <div className="loader-text">{currentMessage}</div>
    </div>
  );
};

export default Loader;
