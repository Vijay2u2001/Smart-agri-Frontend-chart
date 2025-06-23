import { useState, useEffect } from 'react';
import arduinoService from '../services/ArduinoService';
import { SensorData, PlantType, Alert, PlantHealth, ReservoirLevels, ArduinoStatus, Plant } from '../types';

export const useArduinoData = (plantType: PlantType, plant: Plant) => {
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [reservoirLevels, setReservoirLevels] = useState<ReservoirLevels>({ 
    water: 0, 
    waterCm: 0,
    fertilizer: 0, 
    fertilizerCm: 0 
  });
  const [connectionStatus, setConnectionStatus] = useState<ArduinoStatus>({
    connected: false,
    lastConnected: null,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleData = (data: SensorData) => {
      // Validate that the data is for the current plant type
      const expectedDeviceId = plantType === 'level1' ? 'esp32_1' : 'esp32_2';
      if (!data.deviceId || data.deviceId === expectedDeviceId) {
        setSensorData(data);
        setIsLoading(false);
      }
    };

    const handleReservoirData = (levels: ReservoirLevels) => {
      setReservoirLevels(levels);
    };

    const handleConnection = (status: { connected: boolean }) => {
      setConnectionStatus({
        connected: status.connected,
        lastConnected: status.connected ? new Date().toISOString() : connectionStatus.lastConnected,
      });
      
      if (status.connected) {
        setIsLoading(false);
      }
    };

    const handleAlert = (alert: Alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 10));
    };

    const handleError = (error: { message: string; details?: string }) => {
      console.error('Arduino service error:', error);
      
      const errorAlert: Alert = {
        id: Date.now().toString(),
        type: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
        read: false,
      };
      
      setAlerts(prev => [errorAlert, ...prev].slice(0, 10));
    };

    const handleControlSuccess = (response: any) => {
      const successAlert: Alert = {
        id: Date.now().toString(),
        type: 'success',
        message: response.message || `${response.action} command executed successfully`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      
      setAlerts(prev => [successAlert, ...prev].slice(0, 10));
    };

    const handleControlError = (response: any) => {
      const errorAlert: Alert = {
        id: Date.now().toString(),
        type: 'error',
        message: response.message || `Failed to execute ${response.action} command`,
        timestamp: new Date().toISOString(),
        read: false,
      };
      
      setAlerts(prev => [errorAlert, ...prev].slice(0, 10));
    };

    // Subscribe to events
    arduinoService.on('data', handleData);
    arduinoService.on('reservoir', handleReservoirData);
    arduinoService.on('connection', handleConnection);
    arduinoService.on('alert', handleAlert);
    arduinoService.on('error', handleError);
    arduinoService.on('controlSuccess', handleControlSuccess);
    arduinoService.on('controlError', handleControlError);

    // Set active plant
    arduinoService.setActivePlant(plantType);

    // Try to connect if not already connected
    if (!arduinoService.isConnected()) {
      arduinoService.connect().then((connected) => {
        if (!connected) {
          setIsLoading(false);
        }
      });
    } else {
      setConnectionStatus({
        connected: true,
        lastConnected: new Date().toISOString(),
      });
      setIsLoading(false);
    }

    // Initial reservoir levels
    setReservoirLevels(arduinoService.getReservoirLevels());
    
    return () => {
      // Unsubscribe from events
      arduinoService.off('data', handleData);
      arduinoService.off('reservoir', handleReservoirData);
      arduinoService.off('connection', handleConnection);
      arduinoService.off('alert', handleAlert);
      arduinoService.off('error', handleError);
      arduinoService.off('controlSuccess', handleControlSuccess);
      arduinoService.off('controlError', handleControlError);
    };
  }, [plantType, connectionStatus.lastConnected]);

  // Improved plant health calculation based on optimal conditions
  const calculatePlantHealth = (): PlantHealth => {
    if (!sensorData || !plant) {
      return { status: 'fair', score: 50 };
    }

    let totalScore = 0;
    let factorCount = 0;

    // Helper function to calculate score for a parameter
    const calculateParameterScore = (value: number, optimal: { min: number; max: number }): number => {
      if (value >= optimal.min && value <= optimal.max) {
        return 100; // Perfect score if within optimal range
      }
      
      const optimalMid = (optimal.min + optimal.max) / 2;
      const optimalRange = optimal.max - optimal.min;
      const deviation = Math.abs(value - optimalMid);
      
      // Calculate score based on how far from optimal range
      // Give some tolerance outside the range before heavily penalizing
      const tolerance = optimalRange * 0.2; // 20% tolerance
      
      if (deviation <= tolerance) {
        return Math.max(80, 100 - (deviation / tolerance) * 20);
      } else {
        return Math.max(0, 80 - ((deviation - tolerance) / optimalRange) * 60);
      }
    };

    // Soil moisture (weight: 30% - most important)
    const moistureScore = calculateParameterScore(sensorData.moisture, plant.optimalConditions.moisture);
    totalScore += moistureScore * 0.3;
    factorCount += 0.3;

    // Temperature (weight: 25%)
    const temperatureScore = calculateParameterScore(sensorData.temperature, plant.optimalConditions.temperature);
    totalScore += temperatureScore * 0.25;
    factorCount += 0.25;

    // Humidity (weight: 20%)
    const humidityScore = calculateParameterScore(sensorData.humidity, plant.optimalConditions.humidity);
    totalScore += humidityScore * 0.2;
    factorCount += 0.2;

    // Sunlight (weight: 15%)
    const sunlightScore = calculateParameterScore(sensorData.sunlight, plant.optimalConditions.sunlight);
    totalScore += sunlightScore * 0.15;
    factorCount += 0.15;

    // Water level (weight: 10%)
    const waterScore = calculateParameterScore(sensorData.waterLevel, plant.optimalConditions.waterLevel);
    totalScore += waterScore * 0.1;
    factorCount += 0.1;

    const overallScore = totalScore / factorCount;
    
    let status: PlantHealth['status'];
    if (overallScore >= 90) status = 'excellent';
    else if (overallScore >= 75) status = 'good';
    else if (overallScore >= 60) status = 'fair';
    else if (overallScore >= 40) status = 'poor';
    else status = 'critical';

    return { status, score: overallScore };
  };

  // Function to send control actions
  const sendControlAction = async (action: 'water' | 'light' | 'nutrients') => {
    return await arduinoService.sendCommand(action);
  };

  // Function to connect/reconnect to Arduino
  const connectToArduino = async () => {
    return await arduinoService.connect();
  };

  // Mark an alert as read
  const markAlertAsRead = (id: string) => {
    setAlerts(prev => 
      prev.map(alert => 
        alert.id === id ? { ...alert, read: true } : alert
      )
    );
  };

  return {
    sensorData,
    reservoirLevels,
    connectionStatus,
    alerts,
    isLoading,
    plantHealth: calculatePlantHealth(),
    sendControlAction,
    connectToArduino,
    markAlertAsRead,
  };
};