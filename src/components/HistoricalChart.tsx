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

  const averageDataPoints = (rawData: { timestamp: string; value: number }[]): AveragedDataPoint[] => {
    if (!rawData || rawData.length === 0) return [];

    const intervalMs = 5 * 60 * 1000; // 5 minutes
    const buckets = new Map<number, { sum: number; count: number; timestamp: string }>();

    rawData.forEach(point => {
      try {
        const time = new Date(point.timestamp).getTime();
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
        console.error('Error processing data point:', e);
      }
    });

    const averagedData = Array.from(buckets.entries())
      .map(([_, bucket]) => ({
        timestamp: bucket.timestamp,
        value: bucket.count > 0 ? bucket.sum / bucket.count : 0,
        count: bucket.count
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-60); // Keep last 60 averaged points (300 minutes/5 hours)

    return averagedData;
  };

  const getMinMaxValues = () => {
    if (data.length === 0) return { minValue: 0, maxValue: 100, range: 100 };
    
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1; // Prevent division by zero
    
    return { minValue, maxValue, range };
  };

  const { minValue, maxValue, range } = getMinMaxValues();

  const getYPosition = (value: number): number => {
    if (range === 0) return 50;
    return 90 - ((value - minValue) / range * 70);
  };

  const generateSmoothPath = (): string => {
    if (data.length < 2) return '';
    
    const chartWidth = 100;
    const pointGap = chartWidth / (data.length - 1);
    
    let path = `M 0,${getYPosition(data[0].value)}`;
    
    for (let i = 1; i < data.length; i++) {
      const x = i * pointGap;
      const y = getYPosition(data[i].value);
      
      if (i === 1) {
        const prevX = (i - 1) * pointGap;
        const prevY = getYPosition(data[i - 1].value);
        const cpX1 = prevX + pointGap * 0.3;
        const cpY1 = prevY;
        const cpX2 = x - pointGap * 0.3;
        const cpY2 = y;
        path += ` C ${cpX1},${cpY1} ${cpX2},${cpY2} ${x},${y}`;
      } else {
        const prevX = (i - 1) * pointGap;
        const prevY = getYPosition(data[i - 1].value);
        const cpX = prevX + (x - prevX) * 0.5;
        const cpY = prevY + (y - prevY) * 0.5;
        path += ` Q ${cpX},${cpY} ${x},${y}`;
      }
    }
    
    return path;
  };

  const smoothPath = generateSmoothPath();

  useEffect(() => {
    let isMounted = true;
    let updateTimeout: NodeJS.Timeout;

    const fetchHistoricalData = async () => {
      try {
        const historicalData = await arduinoService.getHistoricalData();
        
        if (!isMounted) return;

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
              value = 0;
          }
          
          return {
            timestamp: item.timestamp,
            value: value
          };
        });
        
        const averagedData = averageDataPoints(processedData);
        setData(averagedData);
        setError(null);
      } catch (error) {
        console.error('Failed to fetch historical data:', error);
        if (isMounted) {
          setError('Failed to load data. Please try again later.');
          setData([]);
        }
      }
    };

    const handleDataUpdate = (newData: SensorData) => {
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
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl relative">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
        {title} (Last 5 hours)
      </h3>
      
      <div className="absolute top-6 right-6 text-xs text-gray-700 dark:text-gray-300">
        <div className="font-medium">Avg: {Math.round((data[data.length - 1]?.value || 0) * 100) / 100}{unit}</div>
        <div className="text-gray-500 dark:text-gray-400">Range: {Math.round(minValue * 100) / 100} - {Math.round(maxValue * 100) / 100}{unit}</div>
      </div>
      
      <div className="relative h-52">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <pattern id={`grid-${dataType}`} width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" strokeWidth="0.2" className="text-gray-200 dark:text-gray-700" opacity="0.4"/>
            </pattern>
            <linearGradient id={`gradient-${dataType}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{stopColor: color, stopOpacity: 0.4}} />
              <stop offset="100%" style={{stopColor: color, stopOpacity: 0.05}} />
            </linearGradient>
            <filter id={`glow-${dataType}`}>
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          <rect width="100" height="100" fill={`url(#grid-${dataType})`} />
          
          {[0, 25, 50, 75, 100].map((y) => (
            <g key={y}>
              <line x1="0" y1={y} x2="100" y2={y} stroke="currentColor" strokeWidth="0.1" className="text-gray-300 dark:text-gray-600" />
              <text 
                x="2" 
                y={y} 
                dy="-1" 
                className="fill-current text-gray-500 dark:text-gray-400"
                style={{
                  fontSize: "3px",
                  fontWeight: 300,
                }}
              >
                {Math.round(maxValue - (y / 100) * range)}
              </text>
            </g>
          ))}
          
          {[0, 25, 50, 75, 100].map((x) => (
            <g key={x}>
              <line 
                x1={x} 
                y1="0" 
                x2={x} 
                y2="100" 
                stroke="currentColor" 
                strokeWidth={x % 25 === 0 ? 0.15 : 0.05} 
                className="text-gray-300 dark:text-gray-600" 
              />
              {x % 25 === 0 && data.length > 0 && (
                <text 
                  x={x} 
                  y="98" 
                  textAnchor={x === 0 ? 'start' : x === 100 ? 'end' : 'middle'}
                  className="fill-current text-gray-500 dark:text-gray-400"
                  style={{
                    fontSize: "3px",
                    fontWeight: 300
                  }}
                >
                  {(() => {
                    const dataIndex = Math.floor((x / 100) * (data.length - 1));
                    const timestamp = data[dataIndex]?.timestamp;
                    return timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  })()}
                </text>
              )}
            </g>
          ))}
          
          {smoothPath && (
            <>
              <path
                d={`${smoothPath} L 100,100 L 0,100 Z`}
                fill={`url(#gradient-${dataType})`}
                className="transition-all duration-500 ease-in-out"
              />
              <path
                d={smoothPath}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                className="transition-all duration-500 ease-in-out"
                filter={`url(#glow-${dataType})`}
              />
            </>
          )}
          
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = getYPosition(d.value);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1"
                fill="white"
                stroke={color}
                strokeWidth="0.8"
                className="transition-all duration-300 hover:r-1.5"
              >
                <title>{`${Math.round(d.value * 100) / 100}${unit} (avg of ${d.count} readings) at ${new Date(d.timestamp).toLocaleTimeString()}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default HistoricalChart;