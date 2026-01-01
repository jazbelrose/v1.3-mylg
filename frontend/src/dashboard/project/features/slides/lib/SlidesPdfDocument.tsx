// lib/SlidesPdfDocument.tsx - PDF Document component for slides export
// Follows the same pattern as budget/PdfInvoice.tsx
import React from 'react';
import {
  Document,
  Page,
  Image,
  StyleSheet,
  View,
} from '@react-pdf/renderer';

export interface SlideImageData {
  slideId: string;
  title: string;
  imageDataUrl: string;
}

interface SlidesPdfDocumentProps {
  slideImages: SlideImageData[];
  projectName: string;
}

// 16:9 aspect ratio in points (72 points per inch)
// Using HD proportions scaled to fit typical PDF page
const PAGE_WIDTH = 1920 / 2; // 960 points
const PAGE_HEIGHT = 1080 / 2; // 540 points

const styles = StyleSheet.create({
  page: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    backgroundColor: '#101112',
  },
  slideImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
});

/**
 * PDF Document component for exporting slides
 * Each slide is rendered as a full-page image in landscape 16:9 format
 */
const SlidesPdfDocument: React.FC<SlidesPdfDocumentProps> = ({
  slideImages,
  projectName,
}) => {
  return (
    <Document
      title={projectName}
      author="MYLG Slides"
      creator="MYLG Slides"
      producer="MYLG"
    >
      {slideImages.map((slideData, index) => (
        <Page
          key={slideData.slideId || index}
          size={[PAGE_WIDTH, PAGE_HEIGHT]}
          orientation="landscape"
          style={styles.page}
        >
          <View style={{ width: '100%', height: '100%' }}>
            <Image
              src={slideData.imageDataUrl}
              style={styles.slideImage}
            />
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default SlidesPdfDocument;
