import React from 'react';
import { TweenLite, Power4 } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

interface SmoothScrollContextValue {
  refreshScrollTrigger: () => void;
}

export const SmoothScrollContext = React.createContext<SmoothScrollContextValue>({
  refreshScrollTrigger: () => {},
});

interface SmoothScrollState {
  height: number;
}

export default class SmoothScroll extends React.Component<React.PropsWithChildren<unknown>, SmoothScrollState> {
  state: SmoothScrollState = {
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  };

  private viewport: HTMLDivElement | null = null;
  private fake: HTMLDivElement | null = null;
  private ro: ResizeObserver | null = null;

  componentDidMount() {
    window.addEventListener('scroll', this.onScroll);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver((elements) => {
        for (const elem of elements) {
          const crx = elem.contentRect;
          this.setState({ height: crx.height });
        }
        ScrollTrigger.update();
      });
      if (this.viewport) {
        this.ro.observe(this.viewport);
      }
    }

    if (this.viewport) {
      this.setState({ height: this.viewport.scrollHeight });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.onScroll);
    if (this.ro) {
      this.ro.disconnect();
    }
  }

  onScroll = () => {
    if (this.viewport) {
      TweenLite.to(this.viewport, 2, {
        y: -window.pageYOffset,
        ease: Power4.easeOut,
      });
      ScrollTrigger.update();
    }
  };

  refreshScrollTrigger = () => {
    ScrollTrigger.update();
  };

  render() {
    return (
      <SmoothScrollContext.Provider value={{ refreshScrollTrigger: this.refreshScrollTrigger }}>
        <div className="viewport" ref={(ref) => { this.viewport = ref; }}>
          {this.props.children}
        </div>
        <div ref={(ref) => { this.fake = ref; }} style={{ height: this.state.height }} />
      </SmoothScrollContext.Provider>
    );
  }
}









