import React from 'react';
import { Plant } from '../types';

interface PlantInfoProps {
  plant: Plant;
}

const PlantInfo: React.FC<PlantInfoProps> = ({ plant }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex flex-col md:flex-row gap-6">
      <div className="w-full md:w-1/3 flex-shrink-0">
        <div className="relative rounded-lg overflow-hidden h-48 md:h-full">
          <img
            src={plant.image}
            alt={plant.name}
            className="w-full h-full object-cover transform transition-transform duration-300 hover:scale-105"
          />
        </div>
      </div>
      
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{plant.name}</h2>
          {plant.waterUsagePerDay && (
            <div className="bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-full">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {plant.waterUsagePerDay} L/day
              </span>
            </div>
          )}
        </div>
        
        <div className="mt-4">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">Current Optimal Growing Conditions</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Moisture</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.moisture.min} - {plant.optimalConditions.moisture.max}{plant.optimalConditions.moisture.unit}
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Water Level</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.waterLevel.min} - {plant.optimalConditions.waterLevel.max}{plant.optimalConditions.waterLevel.unit}
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Sunlight</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.sunlight.min} - {plant.optimalConditions.sunlight.max}{plant.optimalConditions.sunlight.unit}
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Temperature</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.temperature.min} - {plant.optimalConditions.temperature.max}{plant.optimalConditions.temperature.unit}
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Humidity</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.humidity.min} - {plant.optimalConditions.humidity.max}{plant.optimalConditions.humidity.unit}
              </p>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Nutrient Level</h4>
              <p className="text-gray-900 dark:text-white font-semibold">
                {plant.optimalConditions.nutrientLevel.min} - {plant.optimalConditions.nutrientLevel.max}{plant.optimalConditions.nutrientLevel.unit}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlantInfo;