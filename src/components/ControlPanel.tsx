import React, { useState, useEffect } from 'react';
import { Droplet, Sun, FlaskRound as Flask } from 'lucide-react';
import arduinoService from '../services/ArduinoService';

interface ControlPanelProps {
  onAction: (action: 'water' | 'light' | 'nutrients') => Promise<boolean>;
  isLoading: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ onAction, isLoading }) => {
  const [actionStates, setActionStates] = useState({
    water: { loading: false, success: false },
    light: { loading: false, success: false },
    nutrients: { loading: false, success: false },
  });

  useEffect(() => {
    // Listen for control responses
    const handleControlSuccess = (response: any) => {
      const action = response.action;
      if (action && actionStates[action as keyof typeof actionStates]) {
        setActionStates(prev => ({
          ...prev,
          [action]: { loading: false, success: true },
        }));
        
        // Reset success state after 2 seconds
        setTimeout(() => {
          setActionStates(prev => ({
            ...prev,
            [action]: { ...prev[action], success: false },
          }));
        }, 2000);
      }
    };

    const handleControlError = (response: any) => {
      const action = response.action;
      if (action && actionStates[action as keyof typeof actionStates]) {
        setActionStates(prev => ({
          ...prev,
          [action]: { loading: false, success: false },
        }));
      }
    };

    arduinoService.on('controlSuccess', handleControlSuccess);
    arduinoService.on('controlError', handleControlError);

    return () => {
      arduinoService.off('controlSuccess', handleControlSuccess);
      arduinoService.off('controlError', handleControlError);
    };
  }, []);

  const handleAction = async (action: 'water' | 'light' | 'nutrients') => {
    if (isLoading || !arduinoService.isConnected()) {
      console.warn('Cannot send command: not connected or loading');
      return;
    }

    setActionStates(prev => ({
      ...prev,
      [action]: { loading: true, success: false },
    }));

    try {
      console.log(`Sending ${action} command...`);
      const success = await onAction(action);
      
      if (!success) {
        // If the action failed immediately, reset loading state
        setActionStates(prev => ({
          ...prev,
          [action]: { loading: false, success: false },
        }));
      }
      // Success state will be handled by the WebSocket response
      
    } catch (error) {
      console.error(`Error sending ${action} command:`, error);
      setActionStates(prev => ({
        ...prev,
        [action]: { loading: false, success: false },
      }));
    }
  };

  const isWateringActive = arduinoService.isWateringActive();
  const isLightActive = arduinoService.isLightActive();
  const isConnected = arduinoService.isConnected();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Controls</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Water Button */}
        <button
          onClick={() => handleAction('water')}
          disabled={actionStates.water.loading || isLoading || !isConnected}
          className={`
            flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-300 transform hover:scale-105
            ${actionStates.water.success 
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 shadow-lg' 
              : isWateringActive
                ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 shadow-md'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 shadow-md'}
            ${actionStates.water.loading || isLoading || !isConnected ? 'opacity-50 cursor-not-allowed transform-none' : 'hover:shadow-lg'}
          `}
        >
          <div className="relative">
            <Droplet 
              size={24} 
              className={`${actionStates.water.loading ? 'animate-pulse' : ''}`} 
            />
            {actionStates.water.success && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
            {isWateringActive && !actionStates.water.loading && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
          </div>
          <span className="mt-2 font-medium text-center">
            {actionStates.water.loading ? 'Processing...' : 
             isWateringActive ? 'Stop Watering' : 'Start Watering'}
          </span>
          {isWateringActive && (
            <span className="text-xs text-red-600 dark:text-red-400 mt-1">Active</span>
          )}
        </button>

        {/* Light Button */}
        <button
          onClick={() => handleAction('light')}
          disabled={actionStates.light.loading || isLoading || !isConnected}
          className={`
            flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-300 transform hover:scale-105
            ${actionStates.light.success 
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 shadow-lg' 
              : isLightActive
                ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-800 shadow-md'
                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 shadow-md'}
            ${actionStates.light.loading || isLoading || !isConnected ? 'opacity-50 cursor-not-allowed transform-none' : 'hover:shadow-lg'}
          `}
        >
          <div className="relative">
            <Sun 
              size={24} 
              className={`${actionStates.light.loading ? 'animate-pulse' : isLightActive ? 'animate-spin' : ''}`} 
            />
            {actionStates.light.success && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
            {isLightActive && !actionStates.light.loading && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
              </span>
            )}
          </div>
          <span className="mt-2 font-medium text-center">
            {actionStates.light.loading ? 'Processing...' : 
             isLightActive ? 'Turn Off Light' : 'Turn On Light'}
          </span>
          {isLightActive && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Active</span>
          )}
        </button>

        {/* Nutrients Button */}
        <button
          onClick={() => handleAction('nutrients')}
          disabled={actionStates.nutrients.loading || isLoading || !isConnected}
          className={`
            flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-300 transform hover:scale-105
            ${actionStates.nutrients.success 
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 shadow-lg' 
              : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 shadow-md'}
            ${actionStates.nutrients.loading || isLoading || !isConnected ? 'opacity-50 cursor-not-allowed transform-none' : 'hover:shadow-lg'}
          `}
        >
          <div className="relative">
            <Flask 
              size={24} 
              className={`${actionStates.nutrients.loading ? 'animate-bounce' : ''}`} 
            />
            {actionStates.nutrients.success && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            )}
          </div>
          <span className="mt-2 font-medium text-center">
            {actionStates.nutrients.loading ? 'Adding Nutrients...' : 'Add Nutrients'}
          </span>
          <span className="text-xs text-green-600 dark:text-green-400 mt-1">One-time dose</span>
        </button>
      </div>

      {/* Connection Status Indicator */}
      <div className="mt-4 flex items-center justify-center">
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`}></div>
          <span>{isConnected ? 'Real-time Connected' : 'Disconnected'}</span>
        </div>
      </div>
      
      {!isConnected && (
        <div className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          Controls are disabled when disconnected
        </div>
      )}
    </div>
  );
};

export default ControlPanel;