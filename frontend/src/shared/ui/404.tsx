import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useData } from "@/app/contexts/useData";
import "./404.css";
import ScrambleButton from "./ScrambleButton";

const NotFound: React.FC = () => {
  const { opacity } = useData();
  const opacityClass = opacity === 1 ? "opacity-high" : "opacity-low";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  return (
    <div className={`not-found-container ${opacityClass}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="not-found-content"
      >
        <h1 className="not-found-heading">404</h1>
        <p className="not-found-subheading">
          The page you are looking for does not exist :(
        </p>
        <Link to="/" className="not-found-link">
          <ScrambleButton text="Go Back Home" />
        </Link>
      </motion.div>
    </div>
  );
};

export default NotFound;









