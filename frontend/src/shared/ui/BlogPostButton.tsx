import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import ScrambleText from 'scramble-text';

import './blog-post-button.css';

interface BlogPostButtonProps {
  post: {
    slug: string;
    title: string;
  };
}

const BlogPostButton: React.FC<BlogPostButtonProps> = ({ post }) => {
  const containerRef = useRef<HTMLHeadingElement | null>(null);
  let scrambleInstance: ScrambleText | null = null;

  const handleMouseEnter = () => {
    const h2Elem = containerRef.current;
    if (!h2Elem || scrambleInstance) return;

    const scrambledElem = h2Elem.querySelector<HTMLSpanElement>('.scrambled');
    if (scrambledElem) {
      h2Elem.style.width = `${h2Elem.offsetWidth}px`;
      scrambleInstance = new ScrambleText(scrambledElem, {
        timeOffset: 12.5,
        chars: ['o', '¦'],
        callback: () => {
          h2Elem.style.width = 'auto';
          scrambleInstance = null;
        },
      });
      scrambleInstance.start().play();
    }
  };

  return (
    <Link to={`/works/${post.slug}`}>
      <h2
        ref={containerRef}
        className="h2 blog-element"
        onMouseEnter={handleMouseEnter}
      >
        <span className="scrambled">{post.title}</span>
      </h2>
    </Link>
  );
};

export default BlogPostButton;









