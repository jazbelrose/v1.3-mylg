/**
 * Performance testing utilities for budget components
 * These help verify that our optimizations are working correctly
 */

import { ChartDataItem, areChartDataEqual, stabilizeChartData, createChartDataHash } from './chartUtils';

export function testChartOptimizations() {
  console.log('🧪 Testing chart optimization utilities...');
  
  // Test data stabilization
  const floatingPointData: ChartDataItem[] = [
    { name: 'Test A', value: 100.000001 },
    { name: 'Test B', value: 200.999999 },
  ];
  
  const stabilized = stabilizeChartData(floatingPointData);
  console.log('✅ Data stabilization:', {
    original: floatingPointData,
    stabilized,
    valuesEqual: stabilized[0].value === 100 && stabilized[1].value === 201
  });
  
  // Test hash generation
  const data1: ChartDataItem[] = [
    { name: 'A', value: 100 },
    { name: 'B', value: 200 },
  ];
  
  const data2: ChartDataItem[] = [
    { name: 'B', value: 200 },
    { name: 'A', value: 100 },
  ];
  
  const hash1 = createChartDataHash(data1);
  const hash2 = createChartDataHash(data2);
  
  console.log('✅ Hash generation (order independent):', {
    hash1,
    hash2,
    equal: hash1 === hash2
  });
  
  // Test equality comparison
  const equal = areChartDataEqual(data1, data2);
  console.log('✅ Equality comparison:', { equal });
  
  // Test with slightly different floating point values
  const data3: ChartDataItem[] = [
    { name: 'A', value: 100.000001 },
    { name: 'B', value: 200.000001 },
  ];
  
  const nearlyEqual = areChartDataEqual(data1, data3);
  console.log('✅ Floating point tolerance:', { nearlyEqual });
  
  console.log('🎉 Chart optimization tests completed!');
}

export function logPerformanceMetrics() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).performance) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navigation = (window as any).performance.getEntriesByType('navigation')[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marks = (window as any).performance.getEntriesByType('mark');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const measures = (window as any).performance.getEntriesByType('measure');
    
    console.log('📊 Performance Metrics:', {
      domContentLoaded: `${navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart}ms`,
      loadComplete: `${navigation?.loadEventEnd - navigation?.loadEventStart}ms`,
      customMarks: marks.length,
      customMeasures: measures.length
    });
  }
}

// Call this in development to verify optimizations
export function runBudgetPerformanceTests() {
  if (process.env.NODE_ENV === 'development') {
    testChartOptimizations();
    logPerformanceMetrics();
  }
}








