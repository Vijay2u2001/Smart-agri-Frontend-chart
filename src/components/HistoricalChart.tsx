import React, { useEffect, useState } from 'react';
import { SensorData } from '../types';
import arduinoService from '../services/ArduinoService';

interface HistoricalChartProps {
  title: string;
  dataType: 'moisture' | 'temperature' | 'nutrients';
  unit: string;
  color: string;
  isLoading: boolean;
}

interface AveragedDataPoint {
  timestamp: string;
  value: number;
  count: number;
}

const HistoricalChart: React.FC<HistoricalChartProps> = ({ 
  title, 
  dataType,
  unit, 
  color,
  isLoading
}) => {
  const [data, setData] = useState<AveragedDataPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const averageDataPoints = (rawData: { timestamp: string; value: number }[]): AveragedDataPoint[] => {
    console.log('Raw data received for averaging:', rawData);
    if (!rawData || rawData.length === 0) {
      console.log('No raw data to average');
      return [];
    }

    const intervalMs = 5 * 60 * 1000; // 5 minutes
    const buckets = new Map<number, { sum: number; count: number; timestamp: string }>();

    rawData.forEach(point => {
      try {
        const time = new Date(point.timestamp).getTime();
        if (isNaN(time)) {
          console.warn('Invalid timestamp:', point.timestamp);
          return;
        }
        
        const bucketKey = Math.floor(time / intervalMs) * intervalMs;
        
        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, { 
            sum: 0, 
            count: 0, 
            timestamp: new Date(bucketKey).toISOString() 
          });
        }
        
        const bucket = buckets.get(bucketKey)!;
        bucket.sum += point.value;
        bucket.count += 1;
      } catch (e) {
        console.error('Error processing data point:', e, point);
      }
    });

    const averagedData = Array.from(buckets.entries())
      .map(([_, bucket]) => ({
        timestamp: bucket.timestamp,
        value: bucket.count > 0 ? bucket.sum / bucket.count : 0,
        count: bucket.count
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-60);

    console.log('Averaged data:', averagedData);
    return averagedData;
  };

  useEffect(() => {
    let isMounted = true;
    let updateTimeout: NodeJS.Timeout;

    const fetchHistoricalData = async () => {
      console.log('Fetching historical data...');
      try {
        const historicalData = await arduinoService.getHistoricalData();
        console.log('Historical data received:', historicalData);
        
        if (!isMounted) return;

        if (!historicalData || historicalData.length === 0) {
          console.warn('No data returned from service');
          setError('No data available from the server');
          setData([]);
          return;
        }

        const processedData = historicalData.map(item => {
          let value = 0;
          
          switch (dataType) {
            case 'moisture':
              value = item.moisture;
              break;
            case 'temperature':
              value = item.temperature;
              break;
            case 'nutrients':
              value = (item.nitrogen + item.phosphorus + item.potassium) / 3;
              break;
            default:
              console.warn('Unknown data type:', dataType);
              value = 0;
          }
          
          return {
            timestamp: item.timestamp,
            value: value
          };
        });
        
        console.log('Processed data:', processedData);
        const averagedData = averageDataPoints(processedData);
        setData(averagedData);
        setError(null);
        
        // Set debug info
        setDebugInfo({
          lastFetch: new Date().toISOString(),
          dataPoints: processedData.length,
          averagedPoints: averagedData.length,
          sampleData: processedData.slice(0, 3)
        });
      } catch (error) {
        console.error('Failed to fetch historical data:', error);
        if (isMounted) {
          setError('Failed to load data. Please check your connection.');
          setData([]);
          setDebugInfo({
            error: error instanceof Error ? error.message : String(error),
            lastAttempt: new Date().toISOString()
          });
        }
      }
    };

    const handleDataUpdate = (newData: SensorData) => {
      console.log('New data update received:', newData);
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      updateTimeout = setTimeout(() => {
        let value = 0;
        
        switch (dataType) {
          case 'moisture':
            value = newData.moisture;
            break;
          case 'temperature':
            value = newData.temperature;
            break;
          case 'nutrients':
            value = (newData.nitrogen + newData.phosphorus + newData.potassium) / 3;
            break;
          default:
            value = 0;
        }
        
        setData(prevData => {
          const newPoint = {
            timestamp: newData.timestamp,
            value: value
          };
          
          const updatedRawData = [...prevData.map(p => ({ timestamp: p.timestamp, value: p.value })), newPoint];
          return averageDataPoints(updatedRawData);
        });
      }, 30000);
    };

    fetchHistoricalData();
    arduinoService.on('data', handleDataUpdate);

    return () => {
      isMounted = false;
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      arduinoService.off('data', handleDataUpdate);
    };
  }, [dataType]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 h-72 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 h-72 flex flex-col items-center justify-center">
        <div className="text-red-500 dark:text-red-400 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-center">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
        
        {debugInfo && (
          <details className="mt-4 text-xs text-gray-500">
            <summary>Debug Info</summary>
            <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-2 overflow-auto max-h-20">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 h-72 flex flex-col items-center justify-center">
        <div className="text-gray-400 dark:text-gray-500 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-center">No data available</p>
        
        {debugInfo && (
          <details className="mt-4 text-xs text-gray-500">
            <summary>Debug Info</summary>
            <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-2 overflow-auto max-h-20">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  // ... rest of your chart rendering code remains the same ...
  // (Keep all the chart SVG and visualization code you had before)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl relative">
      {/* ... your existing chart rendering code ... */}
    </div>
  );
};

export default HistoricalChart;