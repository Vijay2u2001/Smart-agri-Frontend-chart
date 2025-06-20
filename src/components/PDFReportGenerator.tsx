import React, { useState, useEffect } from 'react';
import { SensorData, Plant } from '../types';
import { Download, FileText, Clock, Calendar } from 'lucide-react';
import arduinoService from '../services/ArduinoService';

interface PDFReportGeneratorProps {
  plant: Plant;
  sensorData: SensorData | null;
}

const PDFReportGenerator: React.FC<PDFReportGeneratorProps> = ({ 
  plant, 
  sensorData
}) => {
  const [allData, setAllData] = useState<SensorData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const historicalData = await arduinoService.getHistoricalData();
        setAllData(historicalData);
      } catch (error) {
        console.error('Failed to fetch historical data:', error);
      }
    };

    fetchAllData();

    // Update data when new sensor data comes in
    const handleDataUpdate = (newData: SensorData) => {
      setAllData(prev => [...prev, newData].slice(-100)); // Keep last 100 records
    };

    arduinoService.on('data', handleDataUpdate);

    return () => {
      arduinoService.off('data', handleDataUpdate);
    };
  }, []);
  
  const calculateTimeRange = () => {
    if (!allData || allData.length === 0) return null;
    
    const timestamps = allData
      .map(data => data?.timestamp ? new Date(data.timestamp).getTime() : 0)
      .filter(Boolean);
    
    if (timestamps.length === 0) return null;

    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    
    return {
      start: new Date(minTime),
      end: new Date(maxTime),
      duration: maxTime - minTime
    };
  };

  const formatDuration = (ms: number) => {
    if (isNaN(ms) || ms <= 0) return "0 seconds";
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  };

  // Helper function to calculate min, max, and average
  const getMinMaxAvg = (values: number[]) => {
    if (!values || values.length === 0) return { min: 0, max: 0, avg: 0 };
    const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));
    if (validValues.length === 0) return { min: 0, max: 0, avg: 0 };
    
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const avg = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
    return { min, max, avg };
  };

  // Helper function to check if value is within optimal range
  const isOptimal = (value: number, range: { min: number; max: number }) => {
    return value >= range.min && value <= range.max;
  };

  const generatePDFContent = () => {
    const timeRange = calculateTimeRange();
    if (!timeRange || !allData || allData.length === 0) return '';

    const reportDate = new Date().toLocaleDateString();
    const reportTime = new Date().toLocaleTimeString();
    const durationString = formatDuration(timeRange.duration);
    
    // Get min/max/avg for each metric
    const metrics = {
      temperature: getMinMaxAvg(allData.map(d => d?.temperature)),
      humidity: getMinMaxAvg(allData.map(d => d?.humidity)),
      moisture: getMinMaxAvg(allData.map(d => d?.moisture)),
      sunlight: getMinMaxAvg(allData.map(d => d?.sunlight)),
      nitrogen: getMinMaxAvg(allData.map(d => d?.nitrogen)),
      phosphorus: getMinMaxAvg(allData.map(d => d?.phosphorus)),
      potassium: getMinMaxAvg(allData.map(d => d?.potassium)),
      waterLevel: getMinMaxAvg(allData.map(d => d?.waterLevel)),
      fertilizerLevel: getMinMaxAvg(allData.map(d => d?.fertilizerLevel)),
    };

    // Calculate health scores
    const healthScores = allData.map(data => {
      let score = 0;
      let factors = 0;

      // Moisture score
      if (data.moisture >= plant.optimalConditions.moisture.min && data.moisture <= plant.optimalConditions.moisture.max) {
        score += 100;
      } else {
        score += Math.max(0, 100 - Math.abs(data.moisture - (plant.optimalConditions.moisture.min + plant.optimalConditions.moisture.max) / 2) * 2);
      }
      factors++;

      // Temperature score
      if (data.temperature >= plant.optimalConditions.temperature.min && data.temperature <= plant.optimalConditions.temperature.max) {
        score += 100;
      } else {
        score += Math.max(0, 100 - Math.abs(data.temperature - (plant.optimalConditions.temperature.min + plant.optimalConditions.temperature.max) / 2) * 3);
      }
      factors++;

      // Humidity score
      if (data.humidity >= plant.optimalConditions.humidity.min && data.humidity <= plant.optimalConditions.humidity.max) {
        score += 100;
      } else {
        score += Math.max(0, 100 - Math.abs(data.humidity - (plant.optimalConditions.humidity.min + plant.optimalConditions.humidity.max) / 2) * 2);
      }
      factors++;

      return score / factors;
    });

    const avgHealthScore = healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Smart Agriculture Report - ${plant?.name || 'Unknown Plant'}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f8f9fa;
        }
        .header {
            background: linear-gradient(135deg, #22c55e, #16a34a);
            color: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(34, 197, 94, 0.3);
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 2.5em;
            font-weight: 700;
        }
        .header p {
            margin: 5px 0;
            font-size: 1.1em;
            opacity: 0.9;
        }
        .time-range {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .time-range-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 255, 255, 0.2);
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: 500;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            border-left: 5px solid #22c55e;
        }
        .summary-card h3 {
            margin: 0 0 15px 0;
            color: #16a34a;
            font-size: 1.2em;
        }
        .summary-card .value {
            font-size: 2em;
            font-weight: 700;
            color: #333;
            margin-bottom: 5px;
        }
        .summary-card .label {
            color: #666;
            font-size: 0.9em;
        }
        .metrics-section {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            margin-bottom: 30px;
        }
        .metrics-section h2 {
            color: #16a34a;
            margin-bottom: 25px;
            font-size: 1.8em;
            border-bottom: 3px solid #22c55e;
            padding-bottom: 10px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .metric-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #e9ecef;
        }
        .metric-card h4 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 1.1em;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .metric-values {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            text-align: center;
        }
        .metric-value {
            background: white;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #dee2e6;
        }
        .metric-value .label {
            font-size: 0.8em;
            color: #666;
            margin-bottom: 5px;
        }
        .metric-value .value {
            font-weight: 700;
            color: #333;
        }
        .optimal-indicator {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 600;
            margin-left: 10px;
        }
        .optimal-good { background: #d1fae5; color: #065f46; }
        .optimal-warning { background: #fef3c7; color: #92400e; }
        .optimal-danger { background: #fee2e2; color: #991b1b; }
        .health-section {
            background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            border: 1px solid #0ea5e9;
        }
        .health-score {
            text-align: center;
            margin-bottom: 20px;
        }
        .health-score .score {
            font-size: 3em;
            font-weight: 700;
            color: ${avgHealthScore >= 80 ? '#16a34a' : avgHealthScore >= 60 ? '#f59e0b' : '#dc2626'};
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        .data-table th {
            background: #22c55e;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        .data-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #e9ecef;
        }
        .data-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
        @media print {
            body { background: white; }
            .summary-card, .metrics-section, .health-section { box-shadow: none; border: 1px solid #ddd; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌱 Smart Agriculture Report</h1>
        <p><strong>Plant:</strong> ${plant?.name || 'Unknown Plant'}</p>
        <p><strong>Device:</strong> ${plant?.id === 'level1' ? 'ESP32_1' : 'ESP32_2'}</p>
        <p><strong>Generated:</strong> ${reportDate} at ${reportTime}</p>
        
        <div class="time-range">
            <div class="time-range-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${timeRange.start.toLocaleDateString()} to ${timeRange.end.toLocaleDateString()}
            </div>
            <div class="time-range-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${timeRange.start.toLocaleTimeString()} - ${timeRange.end.toLocaleTimeString()}
            </div>
        </div>
        <p><strong>Monitoring Duration:</strong> ${durationString}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>📊 Data Points Collected</h3>
            <div class="value">${allData.length}</div>
            <div class="label">Total sensor readings</div>
        </div>
        <div class="summary-card">
            <h3>⏱️ Monitoring Duration</h3>
            <div class="value">${durationString}</div>
            <div class="label">Continuous monitoring</div>
        </div>
        <div class="summary-card">
            <h3>🌡️ Avg Temperature</h3>
            <div class="value">${metrics.temperature.avg.toFixed(1)}°C</div>
            <div class="label">Range: ${metrics.temperature.min.toFixed(1)}°C - ${metrics.temperature.max.toFixed(1)}°C</div>
        </div>
        <div class="summary-card">
            <h3>💧 Avg Moisture</h3>
            <div class="value">${metrics.moisture.avg.toFixed(1)}%</div>
            <div class="label">Range: ${metrics.moisture.min.toFixed(1)}% - ${metrics.moisture.max.toFixed(1)}%</div>
        </div>
    </div>

    <div class="health-section">
        <h2>🌿 Plant Health Analysis</h2>
        <div class="health-score">
            <div class="score">${avgHealthScore.toFixed(0)}%</div>
            <p>Overall Plant Health Score</p>
        </div>
        <p style="text-align: center; font-size: 1.1em;">
            Based on ${allData.length} sensor readings over ${durationString}, your plant's health is 
            <strong>${avgHealthScore >= 80 ? 'Excellent' : avgHealthScore >= 60 ? 'Good' : avgHealthScore >= 40 ? 'Fair' : 'Needs Attention'}</strong>.
        </p>
    </div>

    <div class="metrics-section">
        <h2>📈 Detailed Sensor Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <h4>🌡️ Temperature
                    <span class="optimal-indicator ${isOptimal(metrics.temperature.avg, plant.optimalConditions.temperature) ? 'optimal-good' : 'optimal-warning'}">
                        ${isOptimal(metrics.temperature.avg, plant.optimalConditions.temperature) ? 'Optimal' : 'Needs Adjustment'}
                    </span>
                </h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.temperature.min.toFixed(1)}°C</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.temperature.avg.toFixed(1)}°C</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.temperature.max.toFixed(1)}°C</div>
                    </div>
                </div>
                <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    Optimal range: ${plant.optimalConditions.temperature.min}°C - ${plant.optimalConditions.temperature.max}°C
                </p>
            </div>

            <div class="metric-card">
                <h4>💧 Soil Moisture
                    <span class="optimal-indicator ${isOptimal(metrics.moisture.avg, plant.optimalConditions.moisture) ? 'optimal-good' : 'optimal-warning'}">
                        ${isOptimal(metrics.moisture.avg, plant.optimalConditions.moisture) ? 'Optimal' : 'Needs Adjustment'}
                    </span>
                </h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.moisture.min.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.moisture.avg.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.moisture.max.toFixed(1)}%</div>
                    </div>
                </div>
                <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    Optimal range: ${plant.optimalConditions.moisture.min}% - ${plant.optimalConditions.moisture.max}%
                </p>
            </div>

            <div class="metric-card">
                <h4>💨 Humidity
                    <span class="optimal-indicator ${isOptimal(metrics.humidity.avg, plant.optimalConditions.humidity) ? 'optimal-good' : 'optimal-warning'}">
                        ${isOptimal(metrics.humidity.avg, plant.optimalConditions.humidity) ? 'Optimal' : 'Needs Adjustment'}
                    </span>
                </h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.humidity.min.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.humidity.avg.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.humidity.max.toFixed(1)}%</div>
                    </div>
                </div>
                <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    Optimal range: ${plant.optimalConditions.humidity.min}% - ${plant.optimalConditions.humidity.max}%
                </p>
            </div>

            <div class="metric-card">
                <h4>☀️ Sunlight
                    <span class="optimal-indicator ${isOptimal(metrics.sunlight.avg, plant.optimalConditions.sunlight) ? 'optimal-good' : 'optimal-warning'}">
                        ${isOptimal(metrics.sunlight.avg, plant.optimalConditions.sunlight) ? 'Optimal' : 'Needs Adjustment'}
                    </span>
                </h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.sunlight.min.toFixed(0)} lux</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.sunlight.avg.toFixed(0)} lux</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.sunlight.max.toFixed(0)} lux</div>
                    </div>
                </div>
                <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    Optimal range: ${plant.optimalConditions.sunlight.min} - ${plant.optimalConditions.sunlight.max} lux
                </p>
            </div>

            <div class="metric-card">
                <h4>🧪 Nitrogen (N)</h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.nitrogen.min.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.nitrogen.avg.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.nitrogen.max.toFixed(1)} mg/kg</div>
                    </div>
                </div>
            </div>

            <div class="metric-card">
                <h4>🧪 Phosphorus (P)</h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.phosphorus.min.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.phosphorus.avg.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.phosphorus.max.toFixed(1)} mg/kg</div>
                    </div>
                </div>
            </div>

            <div class="metric-card">
                <h4>🧪 Potassium (K)</h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.potassium.min.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.potassium.avg.toFixed(1)} mg/kg</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.potassium.max.toFixed(1)} mg/kg</div>
                    </div>
                </div>
            </div>

            <div class="metric-card">
                <h4>🚰 Water Reservoir</h4>
                <div class="metric-values">
                    <div class="metric-value">
                        <div class="label">Minimum</div>
                        <div class="value">${metrics.waterLevel.min.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Average</div>
                        <div class="value">${metrics.waterLevel.avg.toFixed(1)}%</div>
                    </div>
                    <div class="metric-value">
                        <div class="label">Maximum</div>
                        <div class="value">${metrics.waterLevel.max.toFixed(1)}%</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="metrics-section">
        <h2>📋 Recent Sensor Readings</h2>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>Temperature (°C)</th>
                    <th>Humidity (%)</th>
                    <th>Moisture (%)</th>
                    <th>Sunlight (lux)</th>
                    <th>N (mg/kg)</th>
                    <th>P (mg/kg)</th>
                    <th>K (mg/kg)</th>
                </tr>
            </thead>
            <tbody>
                ${allData.slice(-20).reverse().map(data => `
                    <tr>
                        <td>${new Date(data.timestamp).toLocaleString()}</td>
                        <td>${data.temperature.toFixed(1)}</td>
                        <td>${data.humidity.toFixed(1)}</td>
                        <td>${data.moisture.toFixed(1)}</td>
                        <td>${data.sunlight.toFixed(0)}</td>
                        <td>${data.nitrogen.toFixed(1)}</td>
                        <td>${data.phosphorus.toFixed(1)}</td>
                        <td>${data.potassium.toFixed(1)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="footer">
        <p>This report was automatically generated by the Smart Agriculture System.</p>
        <p>For questions or support, please contact your system administrator.</p>
        <p>Report generated on ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
    `;
  };

  const downloadPDF = async () => {
    try {
      setIsGenerating(true);
      
      const timeRange = calculateTimeRange();
      if (!timeRange || !allData || allData.length === 0) {
        alert('No data available to generate report. Please wait for sensor data to be collected.');
        return;
      }

      const htmlContent = generatePDFContent();
      
      // Create a more robust blob with proper MIME type
      const blob = new Blob([htmlContent], { 
        type: 'text/html;charset=utf-8' 
      });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smart-agriculture-report-${plant?.name?.toLowerCase()?.replace(/\s+/g, '-') || 'report'}-${new Date().toISOString().split('T')[0]}.html`;
      
      // Ensure the link is added to DOM for Firefox compatibility
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const timeRange = calculateTimeRange();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Data Report
          </h2>
        </div>
        <button
          onClick={downloadPDF}
          disabled={!timeRange || isGenerating}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
            timeRange && !isGenerating
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transform hover:scale-105'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
        >
          <Download size={16} className={isGenerating ? 'animate-spin' : ''} />
          {isGenerating ? 'Generating...' : 'Download Report'}
        </button>
      </div>

      {timeRange ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Data Points</h3>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{allData?.length || 0}</p>
          </div>
          <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-green-800 dark:text-green-300">Monitoring Period</h3>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">{timeRange ? formatDuration(timeRange.duration) : '0 seconds'}</p>
          </div>
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-purple-800 dark:text-purple-300">Start Time</h3>
            <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
              {timeRange?.start.toLocaleTimeString() || 'N/A'}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              {timeRange?.start.toLocaleDateString() || 'N/A'}
            </p>
          </div>
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-orange-800 dark:text-orange-300">End Time</h3>
            <p className="text-lg font-bold text-orange-900 dark:text-orange-100">
              {timeRange?.end.toLocaleTimeString() || 'N/A'}
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300">
              {timeRange?.end.toLocaleDateString() || 'N/A'}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No data available yet.</p>
          <p className="text-sm">Data will appear here once sensor readings are collected.</p>
        </div>
      )}
    </div>
  );
};

export default PDFReportGenerator;