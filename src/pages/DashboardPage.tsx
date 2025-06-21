import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlant } from '../context/PlantContext';
import { useTheme } from '../context/ThemeContext';
import { useArduinoData } from '../hooks/useArduinoData';

import Sidebar from '../components/Sidebar';
import SensorReadings from '../components/SensorReadings';
import PlantInfo from '../components/PlantInfo';
import ControlPanel from '../components/ControlPanel';
import ReservoirStatus from '../components/ReservoirStatus';
import ConnectionStatus from '../components/ConnectionStatus';
import Alerts from '../components/Alerts';
import HistoricalChart from '../components/HistoricalChart';
import PlantManager from '../components/PlantManager';
import PDFReportGenerator from '../components/PDFReportGenerator';

import { LogOut, Moon, Sun } from 'lucide-react';

const DashboardPage: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPlantManager, setShowPlantManager] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activePlant } = usePlant();
  const navigate = useNavigate();
  
  const {
    sensorData,
    reservoirLevels,
    connectionStatus,
    alerts,
    isLoading,
    plantHealth,
    sendControlAction,
    connectToArduino,
    markAlertAsRead,
  } = useArduinoData(activePlant.id, activePlant);

  // Protect route - redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    await connectToArduino();
    setIsConnecting(false);
  }, [connectToArduino]);

  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Sidebar */}
      <Sidebar 
        isMobileOpen={isMobileMenuOpen} 
        setIsMobileOpen={setIsMobileMenuOpen}
        onManagePlants={() => setShowPlantManager(true)}
      />
      
      {/* Plant Manager Modal */}
      <PlantManager 
        isOpen={showPlantManager}
        onClose={() => setShowPlantManager(false)}
      />
      
      {/* Main Content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm z-10">
          <div className="flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {activePlant.name} Dashboard
            </h1>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <ConnectionStatus 
                status={connectionStatus}
                onConnect={handleConnect}
                isConnecting={isConnecting}
              />
              
              {/* Alerts */}
              <Alerts 
                alerts={alerts}
                onMarkAsRead={markAlertAsRead}
              />
              
              {/* Theme Toggle */}
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              
              {/* User Menu */}
              <div className="relative">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {user?.name}
                  </span>
                  <button
                    onClick={logout}
                    className="p-1 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Log out"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 transition-all duration-500">
          <div className="grid grid-cols-1 gap-6">
            {/* Plant Info (non-editable) */}
            <PlantInfo plant={activePlant} />
            
            {/* Sensor Readings */}
            <SensorReadings 
              data={sensorData}
              plant={activePlant}
              plantHealth={plantHealth}
              isLoading={isLoading}
            />
            
            {/* Controls & Reservoir */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ControlPanel 
                onAction={sendControlAction}
                isLoading={isLoading || !connectionStatus.connected}
              />
              <ReservoirStatus levels={reservoirLevels} />
            </div>
            
            {/* PDF Report Generator */}
            <PDFReportGenerator 
              plant={activePlant}
              sensorData={sensorData}
            />
            
            {/* Historical Data */}
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-4 font-['Poppins',_'Inter',_'system-ui',_sans-serif]">
              Historical Data Analytics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <HistoricalChart
                title="Moisture Trends"
                dataType="moisture"
                unit="%"
                color="#3b82f6"
                isLoading={isLoading}
              />
              <HistoricalChart
                title="Temperature Trends"
                dataType="temperature"
                unit="°C"
                color="#ef4444"
                isLoading={isLoading}
              />
              <HistoricalChart
                title="Nutrient Level Trends"
                dataType="nutrients"
                unit="mg/kg"
                color="#22c55e"
                isLoading={isLoading}
              />
            </div>
          </div>
        </main>
        
        {/* Footer with Health Score Explanation */}
        <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                🌱 Plant Health Score Calculation
              </h3>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p>
                  <strong>Health Score Formula:</strong> Weighted average based on optimal growing conditions
                </p>
                <div className="flex flex-wrap justify-center gap-4 mt-2">
                  <span>• Soil Moisture: 30% weight</span>
                  <span>• Temperature: 25% weight</span>
                  <span>• Humidity: 20% weight</span>
                  <span>• Sunlight: 15% weight</span>
                  <span>• Water Level: 10% weight</span>
                </div>
                <p className="mt-2">
                  <strong>Scoring:</strong> 100% = Within optimal range, 80%+ = Close to optimal, 60%+ = Acceptable, Below 60% = Needs attention
                </p>
                <p className="text-gray-500 dark:text-gray-500">
                  Smart Agriculture Box © 2025 | Real-time monitoring and intelligent plant care
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default DashboardPage;