import { io, Socket } from 'socket.io-client';
import { SensorData, PlantType, ControlAction, Alert, ReservoirLevels, ArduinoStatus } from '../types';

// Utility function to safely convert values to numbers
const safeNumber = (value: any, defaultValue: number = 0): number => {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

// Utility function to validate and process sensor data
const validateSensorData = (data: any, deviceId: string = '', plantType: PlantType = 'level1'): SensorData => {
  const now = new Date().toISOString();
  
  // Extract NPK values properly from nested structure or direct values
  let nitrogen = 0, phosphorus = 0, potassium = 0;
  
  if (data.npk) {
    nitrogen = safeNumber(data.npk.N, 0);
    phosphorus = safeNumber(data.npk.P, 0);
    potassium = safeNumber(data.npk.K, 0);
  } else {
    nitrogen = safeNumber(data.nitrogen, 0);
    phosphorus = safeNumber(data.phosphorus, 0);
    potassium = safeNumber(data.potassium, 0);
  }
  
  // Use moisture_percent or soil_moisture_percent instead of raw moisture
  let moisturePercent = 0;
  if (data.moisture_percent !== undefined) {
    moisturePercent = safeNumber(data.moisture_percent, 0);
  } else if (data.soil_moisture_percent !== undefined) {
    moisturePercent = safeNumber(data.soil_moisture_percent, 0);
  } else {
    // Fallback to raw moisture if percentage not available
    moisturePercent = safeNumber(data.moisture, 0);
  }
  
  // Extract sunlight/lux values
  let sunlightValue = 0;
  if (data.lux !== undefined) {
    sunlightValue = safeNumber(data.lux, 0);
  } else if (data.lightLevel !== undefined) {
    sunlightValue = safeNumber(data.lightLevel, 0);
  } else if (data.ldr !== undefined) {
    sunlightValue = safeNumber(data.ldr, 0);
  }
  
  return {
    // Temperature and humidity from ESP32_1 for both levels
    temperature: safeNumber(data?.temperature, 20),
    humidity: safeNumber(data?.humidity, 50),
    
    // Device-specific data - use percentage values
    moisture: moisturePercent, // Use percentage value
    sunlight: sunlightValue,
    nitrogen: nitrogen,
    phosphorus: phosphorus,
    potassium: potassium,
    
    // Reservoir levels
    waterLevel: safeNumber(data?.waterLevelPercent || data?.waterLevel, 0),
    fertilizerLevel: safeNumber(data?.fertilizer_level || data?.fertilizerLevel, 0),
    
    timestamp: data?.timestamp || now,
    deviceId: deviceId,
  };
};

class ArduinoService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Function[]> = new Map();
  private connected = false;
  private plantType: PlantType = 'level1';
  private wateringActive = false;
  private lightActive = false;
  private backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://smart-agri-backend-ysjs.onrender.com';
  private retryDelay = 5000;
  private currentSensorData: Record<string, SensorData> = {};
  private currentReservoirLevels: ReservoirLevels = { 
    water: 75, 
    waterCm: 15,
    fertilizer: 60, 
    fertilizerCm: 12 
  };
  private connectionTimeout: NodeJS.Timeout | null = null;
  private historicalData: Record<string, SensorData[]> = {
    level1: [],
    level2: []
  };

  public async connect(): Promise<boolean> {
    // Clear any existing connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Please check backend server.`);
      this.emit('error', { 
        message: `Unable to connect to backend server after ${this.maxReconnectAttempts} attempts. Please check if the server is running.`,
        details: `Backend URL: ${this.backendUrl}`
      });
      return false;
    }

    try {
      console.log(`Attempting to connect to backend at ${this.backendUrl} (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.socket = io(this.backendUrl, {
        transports: ['websocket', 'polling'],
        timeout: 15000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 3000,
        forceNew: true,
      });

      this.setupSocketListeners();

      return new Promise((resolve) => {
        if (!this.socket) {
          resolve(false);
          return;
        }

        // Set a connection timeout
        this.connectionTimeout = setTimeout(() => {
          console.warn('Connection timeout reached');
          if (this.socket && !this.connected) {
            this.socket.disconnect();
            this.handleConnectionError(new Error('Connection timeout'));
            resolve(false);
          }
        }, 20000);

        this.socket.on('connect', () => {
          console.log('✅ Successfully connected to backend via WebSocket');
          this.connected = true;
          this.reconnectAttempts = 0;
          
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          
          this.emit('connection', { connected: true });
          
          // Request initial data for both devices
          this.socket?.emit('requestInitialData', { 
            plantType: this.plantType,
            deviceIds: ['esp32_1', 'esp32_2']
          });
          
          // Emit success alert
          this.emit('alert', {
            id: Date.now().toString(),
            type: 'success',
            message: 'Successfully connected to backend server',
            timestamp: new Date().toISOString(),
            read: false,
          });
          
          resolve(true);
        });

        this.socket.on('connect_error', (error) => {
          console.warn('WebSocket connection error:', error.message || error);
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          this.handleConnectionError(error);
          resolve(false);
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn('Connection error:', errorMessage);
      this.handleConnectionError(error);
      return false;
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Handle initial data from backend
    this.socket.on('initData', (data) => {
      console.log('📡 Initial data received from backend:', data);
      
      // Process sensor data from both devices
      if (data.sensorData) {
        Object.keys(data.sensorData).forEach(deviceId => {
          const deviceData = data.sensorData[deviceId];
          if (deviceData) {
            this.currentSensorData[deviceId] = validateSensorData(deviceData, deviceId, this.plantType);
          }
        });
        
        // Emit data for current plant type
        this.emitCurrentPlantData();
      }
      
      // Process reservoir levels
      if (data.reservoirLevels) {
        this.currentReservoirLevels = data.reservoirLevels;
        this.emit('reservoir', this.currentReservoirLevels);
      }
      
      // Process device states
      if (data.deviceStates) {
        Object.keys(data.deviceStates).forEach(deviceId => {
          const deviceState = data.deviceStates[deviceId];
          if (deviceState) {
            if (deviceId === 'esp32_1') {
              this.wateringActive = Boolean(deviceState.waterPump);
            }
            const currentDeviceId = this.plantType === 'level1' ? 'esp32_1' : 'esp32_2';
            if (deviceId === currentDeviceId) {
              this.lightActive = Boolean(deviceState.light);
            }
          }
        });
      }
    });

    // Handle real-time data updates
    this.socket.on('dataUpdate', (update) => {
      console.log('📊 Data update received:', update);
      
      if (update.deviceId && update.data) {
        this.currentSensorData[update.deviceId] = validateSensorData(update.data, update.deviceId, this.plantType);
        
        // Store in historical data
        const plantType = update.plantType || (update.deviceId === 'esp32_1' ? 'level1' : 'level2');
        if (!this.historicalData[plantType]) {
          this.historicalData[plantType] = [];
        }
        this.historicalData[plantType].push(this.currentSensorData[update.deviceId]);
        
        // Keep only last 100 records
        if (this.historicalData[plantType].length > 100) {
          this.historicalData[plantType] = this.historicalData[plantType].slice(-100);
        }
        
        // Emit data for current plant type
        this.emitCurrentPlantData();
      }
    });

    // Handle reservoir updates
    this.socket.on('reservoirUpdate', (levels) => {
      console.log('🚰 Reservoir update received:', levels);
      this.currentReservoirLevels = levels;
      this.emit('reservoir', levels);
    });

    // Handle control responses
    this.socket.on('controlResponse', (response) => {
      console.log('🎮 Control response received:', response);
      
      // Update local state based on response
      if (response.action === 'water') {
        this.wateringActive = response.active || false;
      } else if (response.action === 'light') {
        this.lightActive = response.active || false;
      }

      if (response.success) {
        this.emit('controlSuccess', response);
      } else {
        this.emit('controlError', response);
      }
    });

    // Handle command responses
    this.socket.on('commandIssued', (command) => {
      console.log('📤 Command issued:', command);
      
      // Update local state based on command
      if (command.command === 'water_pump') {
        this.wateringActive = Boolean(command.value);
      } else if (command.command === 'light_on' || command.command === 'light_off') {
        this.lightActive = command.command === 'light_on';
      }

      this.emit('controlSuccess', {
        action: this.mapCommandToAction(command.command),
        success: true,
        message: `${command.command} command executed successfully`,
        timestamp: new Date().toISOString()
      });
    });

    // Handle command timeouts
    this.socket.on('commandTimeout', (command) => {
      console.log('⏰ Command timeout:', command);
      
      this.emit('controlError', {
        action: this.mapCommandToAction(command.command),
        success: false,
        message: `${command.command} command timed out`,
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.connected = false;
      this.emit('connection', { connected: false });
      
      if (reason === 'io server disconnect') {
        this.handleConnectionError(new Error('Server disconnected'));
      }
    });

    // Handle reconnection
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connection', { connected: true });
      
      // Emit reconnection success alert
      this.emit('alert', {
        id: Date.now().toString(),
        type: 'success',
        message: 'Reconnected to backend server',
        timestamp: new Date().toISOString(),
        read: false,
      });
    });

    this.socket.on('reconnect_error', (error) => {
      console.warn('🔄❌ WebSocket reconnection error:', error.message || error);
      this.handleConnectionError(error);
    });
  }

  private mapCommandToAction(command: string): string {
    const commandMap: Record<string, string> = {
      'water_pump': 'water',
      'light_on': 'light',
      'light_off': 'light',
      'add_nutrients': 'nutrients',
      'fert_pump': 'nutrients',
      'led': 'light'
    };
    return commandMap[command] || command;
  }

  private emitCurrentPlantData(): void {
    // Combine data from both devices based on the specifications
    const esp32_1_data = this.currentSensorData['esp32_1'];
    const esp32_2_data = this.currentSensorData['esp32_2'];
    
    if (!esp32_1_data && !esp32_2_data) {
      console.log('⚠️ No sensor data available from either device');
      return;
    }
    
    let combinedData: SensorData;
    
    if (this.plantType === 'level1') {
      // Level 1: Use ESP32_1 data for moisture, sunlight, NPK
      // Temperature and humidity from ESP32_1
      combinedData = {
        temperature: esp32_1_data?.temperature || 20,
        humidity: esp32_1_data?.humidity || 50,
        moisture: esp32_1_data?.moisture || 0,
        sunlight: esp32_1_data?.sunlight || 0,
        nitrogen: esp32_1_data?.nitrogen || 0,
        phosphorus: esp32_1_data?.phosphorus || 0,
        potassium: esp32_1_data?.potassium || 0,
        waterLevel: esp32_1_data?.waterLevel || 0,
        fertilizerLevel: esp32_2_data?.fertilizerLevel || 0,
        timestamp: new Date().toISOString(),
        deviceId: 'esp32_1'
      };
    } else {
      // Level 2: Use ESP32_2 data for moisture, sunlight, NPK
      // Temperature and humidity from ESP32_1
      combinedData = {
        temperature: esp32_1_data?.temperature || 20,
        humidity: esp32_1_data?.humidity || 50,
        moisture: esp32_2_data?.moisture || 0,
        sunlight: esp32_2_data?.sunlight || 0,
        nitrogen: esp32_2_data?.nitrogen || 0,
        phosphorus: esp32_2_data?.phosphorus || 0,
        potassium: esp32_2_data?.potassium || 0,
        waterLevel: esp32_1_data?.waterLevel || 0,
        fertilizerLevel: esp32_2_data?.fertilizerLevel || 0,
        timestamp: new Date().toISOString(),
        deviceId: 'esp32_2'
      };
    }
    
    console.log(`📊 Emitting combined data for ${this.plantType}:`, combinedData);
    this.emit('data', combinedData);
  }

  private handleConnectionError(error: any): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    this.connected = false;
    this.emit('connection', { connected: false });

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const backoffDelay = Math.min(this.retryDelay * Math.pow(1.5, this.reconnectAttempts - 1), 20000);
      console.log(`🔄 Connection failed. Retrying in ${backoffDelay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, backoffDelay);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emit('error', { 
        message: `Failed to connect to backend after ${this.maxReconnectAttempts} attempts: ${errorMessage}`,
        details: `Backend URL: ${this.backendUrl}. Please check if the server is running and accessible.`
      });
    }
  }

  public disconnect(): void {
    this.connected = false;
    this.reconnectAttempts = 0;
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.emit('connection', { connected: false });
  }

  public isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  public setActivePlant(type: PlantType): void {
    console.log(`🌱 Setting active plant to: ${type}`);
    this.plantType = type;
    
    if (this.socket && this.connected) {
      // Notify backend about plant type change
      this.socket.emit('setPlantType', { plantType: type });
    }
    
    // Emit current data for the new plant type
    this.emitCurrentPlantData();
  }

  public async sendCommand(action: ControlAction): Promise<boolean> {
    if (!this.connected || !this.socket) {
      console.error('❌ Not connected to backend');
      this.emit('controlError', { 
        action, 
        success: false, 
        message: 'Not connected to backend. Please check your connection.' 
      });
      return false;
    }

    try {
      // Determine which device to send command to based on current plant type
      const deviceId = this.plantType === 'level1' ? 'esp32_1' : 'esp32_2';
      
      console.log(`🎮 Sending control command to ${deviceId}: ${action} for plant type: ${this.plantType}`);
      
      // Send command via HTTP POST to backend
      const response = await fetch(`${this.backendUrl}/send-command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceId,
          command: action, // Send action directly - backend will handle mapping
          value: 1,
          duration: 3000,
          plantType: this.plantType
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Command sent successfully:', result);
        
        // Update local state immediately for better UX
        if (action === 'water') {
          this.wateringActive = !this.wateringActive;
        } else if (action === 'light') {
          this.lightActive = !this.lightActive;
        }
        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Command failed:', error);
        this.emit('controlError', { 
          action,
          success: false,
          message: error.message || `Failed to send command: ${JSON.stringify(error)}`
        });
        return false;
      }
    } catch (error) {
      console.error('❌ Command error:', error);
      this.emit('controlError', { 
        action,
        success: false,
        message: `Failed to send command: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      return false;
    }
  }

  public getReservoirLevels(): ReservoirLevels {
    return this.currentReservoirLevels;
  }

  public async getHistoricalData(): Promise<SensorData[]> {
    return this.historicalData[this.plantType] || [];
  }

  public isWateringActive(): boolean {
    return this.wateringActive;
  }

  public isLightActive(): boolean {
    return this.lightActive;
  }

  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  public off(event: string, callback: Function): void {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

export const arduinoService = new ArduinoService();
export default arduinoService;