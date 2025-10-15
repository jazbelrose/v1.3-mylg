import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Mousewheel } from 'swiper/modules';
import { getFileUrl } from '../utils/api';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

import './slide-show.css';

interface Slide {
  imageUrl: string;
  title: string;
  content: string;
  url: string;
}

interface SlideshowProps {
  slides: Slide[];
}

const Slideshow: React.FC<SlideshowProps> = ({ slides }) => {
  return (
    <div className="slideshow-container">
      <Swiper
        modules={[Navigation, Pagination, Mousewheel]}
        navigation
        pagination={{ clickable: true }}
        mousewheel
        spaceBetween={30}
        slidesPerView={1}
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={index}>
            <div className="slide-content">
              <a href={getFileUrl(slide.url)} target="_blank" rel="noopener noreferrer">
                <img src={getFileUrl(slide.imageUrl)} alt={slide.title} />
                <h2>{slide.title}</h2>
                <p>{slide.content}</p>
              </a>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default Slideshow;









