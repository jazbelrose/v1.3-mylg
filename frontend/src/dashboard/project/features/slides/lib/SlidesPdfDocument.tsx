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

// 16:9 aspect ratio - use full HD dimensions for maximum quality
// react-pdf uses points (72 points per inch), but we can use pixel values
const PAGE_WIDTH = 1920;
const PAGE_HEIGHT = 1080;

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#101112',
  },
  slideContainer: {
    width: '100%',
    height: '100%',
  },
  slideImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
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
          size={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
          style={styles.page}
        >
          <View style={styles.slideContainer}>
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
