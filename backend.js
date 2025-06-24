const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enhanced Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: [
      'https://smart-agriculture-box.netlify.app',
      'http://localhost:3000',
      'http://localhost:5173', // Add Vite dev server
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

// Enhanced CORS configuration
const corsOptions = {
  origin: [
    'https://smart-agriculture-box.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173', // Add Vite dev server
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.options('*', cors(corsOptions));
app.enable('trust proxy');

// Constants
const COMMAND_TYPES = {
  LIGHT_ON: 'light_on',
  LIGHT_OFF: 'light_off',
  WATER_PLANT: 'water_plant',
  ADD_NUTRIENTS: 'add_nutrients',
  WATER_PUMP: 'water_pump',
  FERT_PUMP: 'fert_pump',
  LED: 'led',
  GROW_LIGHT: 'grow_light',
  NUTRIENT_PUMP: 'nutrient_pump'
};

const COMMAND_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

// In-memory databases
let sensorData = {};
let historicalData = {};
let pendingCommands = {};
let deviceStates = {};

// Updated device mapping to match frontend expectations
const devicePlantMap = {
  esp32_1: 'level1', // Level 1 plant
  esp32_2: 'level2'  // Level 2 plant
};

// Initialize device states with proper structure
const initializeDeviceStates = () => {
  Object.keys(devicePlantMap).forEach(deviceId => {
    if (!deviceStates[deviceId]) {
      deviceStates[deviceId] = {
        light: false,
        waterPump: false,
        nutrientPump: false,
        lastWatered: null,
        lastNutrients: null,
        lastUpdated: new Date().toISOString(),
        connectionStatus: 'disconnected',
        lastSeen: null
      };
    }
  });
  
  // Initialize with some sample data for testing
  sensorData['esp32_1'] = {
    temperature: 22.5,
    humidity: 65,
    moisture: 72,
    sunlight: 2800, // LDR value
    nitrogen: 45,
    phosphorus: 38,
    potassium: 52,
    waterLevel: 75,
    fertilizerLevel: 60,
    timestamp: new Date().toISOString(),
    deviceId: 'esp32_1'
  };
  
  sensorData['esp32_2'] = {
    temperature: 21.8,
    humidity: 68,
    moisture: 78,
    sunlight: 3200, // LDR value
    nitrogen: 42,
    phosphorus: 41,
    potassium: 48,
    waterLevel: 75,
    fertilizerLevel: 60,
    timestamp: new Date().toISOString(),
    deviceId: 'esp32_2'
  };

  // Initialize historical data
  ['level1', 'level2'].forEach(plantType => {
    if (!historicalData[plantType]) {
      historicalData[plantType] = [];
    }
  });
};
initializeDeviceStates();

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.body) {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// API Documentation Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: '🌱 Smart Agriculture Backend',
    version: '2.4.0',
    frontend: 'https://smart-agriculture-box.netlify.app',
    endpoints: {
      update: 'POST /update',
      data: 'GET /data',
      sensorData: 'GET /sensor-data/:plantType',
      historicalData: 'GET /historical-data/:plantType',
      sendCommand: 'POST /send-command',
      getCommands: 'GET /get-commands/:deviceId',
      deviceStatus: 'GET /device-status/:deviceId',
      health: 'GET /health',
      testEmit: 'GET /test-emit'
    },
    devices: Object.keys(devicePlantMap),
    plantTypes: Object.values(devicePlantMap)
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)} minutes ${Math.floor(uptime % 60)} seconds`,
    memoryUsage: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    },
    connections: io.engine.clientsCount,
    devices: Object.keys(deviceStates).map(id => ({
      id,
      status: deviceStates[id].connectionStatus,
      lastSeen: deviceStates[id].lastSeen,
      plantType: devicePlantMap[id]
    })),
    pendingCommands: Object.keys(pendingCommands).reduce((acc, key) => {
      acc[key] = pendingCommands[key].length;
      return acc;
    }, {}),
    sensorData: Object.keys(sensorData).map(deviceId => ({
      deviceId,
      plantType: devicePlantMap[deviceId],
      lastUpdate: sensorData[deviceId]?.timestamp
    }))
  });
});

// Get sensor data for specific plant type
app.get('/sensor-data/:plantType', (req, res) => {
  try {
    const { plantType } = req.params;
    const deviceId = Object.keys(devicePlantMap).find(id => devicePlantMap[id] === plantType);
    
    if (!deviceId) {
      return res.status(404).json({ 
        error: 'Plant type not found',
        availableTypes: Object.values(devicePlantMap)
      });
    }
    
    const data = sensorData[deviceId];
    if (!data) {
      return res.status(404).json({ 
        error: 'No sensor data available for this plant type',
        deviceId
      });
    }
    
    res.json({
      plantType,
      deviceId,
      data,
      deviceState: deviceStates[deviceId]
    });
  } catch (error) {
    console.error('Error in /sensor-data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Get historical data for specific plant type
app.get('/historical-data/:plantType', (req, res) => {
  try {
    const { plantType } = req.params;
    const data = historicalData[plantType] || [];
    
    res.json({
      plantType,
      data,
      count: data.length
    });
  } catch (error) {
    console.error('Error in /historical-data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Enhanced Data Update Endpoint
app.post('/update', (req, res) => {
  try {
    console.log('Raw update request body:', req.body);
    
    const { deviceId, data } = req.body;

    if (!deviceId || !data) {
      console.error('Missing deviceId or data', req.body);
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['deviceId', 'data'],
        received: Object.keys(req.body)
      });
    }

    // Initialize device state if not exists
    if (!deviceStates[deviceId]) {
      deviceStates[deviceId] = {
        light: false,
        waterPump: false,
        nutrientPump: false,
        lastWatered: null,
        lastNutrients: null,
        lastUpdated: new Date().toISOString(),
        connectionStatus: 'connected',
        lastSeen: new Date().toISOString()
      };
    } else {
      deviceStates[deviceId].connectionStatus = 'connected';
      deviceStates[deviceId].lastSeen = new Date().toISOString();
    }

    // Process data based on device type
    let processedData = {};
    
    if (deviceId === 'esp32_1') {
      // ESP32_1 data processing
      processedData = {
        temperature: parseFloat(data.temperature) || 20,
        humidity: parseFloat(data.humidity) || 50,
        moisture: parseFloat(data.moisture_percent || data.moisture) || 0,
        sunlight: parseFloat(data.lux || data.lightLevel) || 0,
        nitrogen: parseFloat(data.npk?.N || data.nitrogen) || 0,
        phosphorus: parseFloat(data.npk?.P || data.phosphorus) || 0,
        potassium: parseFloat(data.npk?.K || data.potassium) || 0,
        waterLevel: parseFloat(data.waterLevelPercent || data.waterLevel) || 0,
        timestamp: new Date().toISOString(),
        deviceId
      };
    } else if (deviceId === 'esp32_2') {
      // ESP32_2 data processing
      processedData = {
        temperature: sensorData['esp32_1']?.temperature || 20, // Use ESP32_1 temperature
        humidity: sensorData['esp32_1']?.humidity || 50, // Use ESP32_1 humidity
        moisture: parseFloat(data.soil_moisture_percent || data.moisture) || 0,
        sunlight: parseFloat(data.lux || data.ldr) || 0,
        nitrogen: parseFloat(data.nitrogen) || 0,
        phosphorus: parseFloat(data.phosphorus) || 0,
        potassium: parseFloat(data.potassium) || 0,
        fertilizerLevel: parseFloat(data.fertilizer_level) || 0,
        timestamp: new Date().toISOString(),
        deviceId
      };
    }

    // Store latest data
    sensorData[deviceId] = processedData;

    // Update device state from sensor data
    if (data.ledStatus !== undefined) {
      deviceStates[deviceId].light = Boolean(data.ledStatus);
    }
    if (data.waterPumpStatus !== undefined) {
      deviceStates[deviceId].waterPump = Boolean(data.waterPumpStatus);
    }
    if (data.nutrientPumpStatus !== undefined) {
      deviceStates[deviceId].nutrientPump = Boolean(data.nutrientPumpStatus);
    }
    deviceStates[deviceId].lastUpdated = new Date().toISOString();

    // Historical storage
    const plantType = devicePlantMap[deviceId] || 'unknown';
    
    if (!historicalData[plantType]) {
      historicalData[plantType] = [];
    }
    historicalData[plantType].push(processedData);
    
    // Keep only last 100 records per plant type
    if (historicalData[plantType].length > 100) {
      historicalData[plantType] = historicalData[plantType].slice(-100);
    }

    console.log(`Updated sensor data for ${deviceId} (${plantType}):`, processedData);
    
    // Emit to all connected clients with proper event names
    io.emit('dataUpdate', { 
      deviceId, 
      plantType,
      data: processedData, 
      state: deviceStates[deviceId] 
    });
    
    // Also emit reservoir levels separately
    const reservoirLevels = {
      water: sensorData['esp32_1']?.waterLevel || 75,
      waterCm: Math.round((sensorData['esp32_1']?.waterLevel || 75) * 0.2), // Convert % to cm
      fertilizer: sensorData['esp32_2']?.fertilizerLevel || 60,
      fertilizerCm: Math.round((sensorData['esp32_2']?.fertilizerLevel || 60) * 0.2) // Convert % to cm
    };
    
    io.emit('reservoirUpdate', reservoirLevels);
    
    res.json({ 
      status: 'success',
      deviceId,
      plantType,
      receivedAt: new Date().toISOString(),
      dataPoints: historicalData[plantType]?.length || 0
    });

  } catch (error) {
    console.error('Error in /update:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Command Endpoint with Validation and Frontend Mapping
app.post('/send-command', (req, res) => {
  try {
    const { deviceId, command, value, duration, plantType } = req.body;
    
    if (!deviceId || !command) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['deviceId', 'command'],
        optional: ['value', 'duration', 'plantType'],
        received: Object.keys(req.body)
      });
    }

    // Map frontend commands to backend commands
    const commandMapping = {
      'water': 'water_pump',
      'light': 'led',
      'nutrients': 'fert_pump'
    };
    
    const backendCommand = commandMapping[command] || command;

    // Validate command type - check against both mapped and direct commands
    const validCommands = [...Object.values(COMMAND_TYPES), ...Object.keys(commandMapping)];
    if (!validCommands.includes(command) && !Object.values(COMMAND_TYPES).includes(backendCommand)) {
      return res.status(400).json({
        error: 'Invalid command type',
        validCommands: Object.keys(commandMapping),
        backendCommands: Object.values(COMMAND_TYPES),
        received: command
      });
    }

    // Create command object WITHOUT circular references
    const commandObj = {
      id: Date.now().toString(),
      command: backendCommand,
      originalCommand: command,
      value: value !== undefined ? value : 1,
      deviceId,
      plantType: plantType || devicePlantMap[deviceId],
      duration: duration || 3000,
      timestamp: new Date().toISOString(),
      status: COMMAND_STATUS.PENDING,
      issuedBy: req.ip
      // DO NOT include timeoutRef here to avoid circular JSON
    };

    // Initialize command queue if not exists
    if (!pendingCommands[deviceId]) {
      pendingCommands[deviceId] = [];
    }
    pendingCommands[deviceId].push(commandObj);

    // Update device state (predictive)
    if (command === 'water') {
      deviceStates[deviceId].waterPump = !deviceStates[deviceId].waterPump;
      if (deviceStates[deviceId].waterPump) {
        deviceStates[deviceId].lastWatered = new Date().toISOString();
      }
    } else if (command === 'light') {
      deviceStates[deviceId].light = !deviceStates[deviceId].light;
    } else if (command === 'nutrients') {
      deviceStates[deviceId].lastNutrients = new Date().toISOString();
    }

    console.log(`New command queued for ${deviceId}:`, commandObj);
    
    // Broadcast via WebSocket with proper response format
    io.emit('controlResponse', {
      action: command,
      deviceId,
      plantType: commandObj.plantType,
      success: true,
      active: command === 'light' ? deviceStates[deviceId].light : 
              command === 'water' ? deviceStates[deviceId].waterPump : false,
      message: `${command} command executed successfully`,
      timestamp: new Date().toISOString()
    });
    
    // Send command to ESP32 device
    io.to(`device_${deviceId}`).emit('executeCommand', {
      command: backendCommand,
      value: commandObj.value,
      duration: commandObj.duration
    });
    
    // Set timeout for command (5 minutes) - store timeout separately
    const timeout = setTimeout(() => {
      const cmdIndex = pendingCommands[deviceId].findIndex(c => c.id === commandObj.id);
      if (cmdIndex !== -1 && pendingCommands[deviceId][cmdIndex].status === COMMAND_STATUS.PENDING) {
        pendingCommands[deviceId][cmdIndex].status = COMMAND_STATUS.TIMEOUT;
        pendingCommands[deviceId][cmdIndex].timeoutAt = new Date().toISOString();
        
        io.emit('controlResponse', {
          action: command,
          deviceId,
          success: false,
          message: `${command} command timed out`,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Command ${commandObj.id} timed out`);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    // Store timeout reference separately to avoid circular JSON
    if (!global.commandTimeouts) {
      global.commandTimeouts = new Map();
    }
    global.commandTimeouts.set(commandObj.id, timeout);
    
    res.json({
      status: 'success',
      message: 'Command received and queued',
      command: {
        id: commandObj.id,
        command: commandObj.command,
        originalCommand: commandObj.originalCommand,
        deviceId: commandObj.deviceId,
        plantType: commandObj.plantType,
        timestamp: commandObj.timestamp,
        status: commandObj.status
      }
    });

  } catch (error) {
    console.error('Error in /send-command:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Test WebSocket Emission Endpoint
app.get('/test-emit', (req, res) => {
  const testData = {
    message: 'Test message from server',
    timestamp: new Date().toISOString(),
    randomValue: Math.random(),
    sensorData: sensorData,
    deviceStates: deviceStates
  };
  
  io.emit('testEvent', testData);
  console.log('Test event emitted:', testData);
  
  res.json({
    status: 'success',
    message: 'Test event emitted to all connected clients',
    data: testData
  });
});

// Enhanced WebSocket Connection Handling
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log(`📡 New client connected [${socket.id}] from ${clientIp}`);
  
  // Send initial data to newly connected client
  const initData = { 
    sensorData: sensorData,
    deviceStates: deviceStates,
    reservoirLevels: {
      water: sensorData['esp32_1']?.waterLevel || 75,
      waterCm: Math.round((sensorData['esp32_1']?.waterLevel || 75) * 0.2),
      fertilizer: sensorData['esp32_2']?.fertilizerLevel || 60,
      fertilizerCm: Math.round((sensorData['esp32_2']?.fertilizerLevel || 60) * 0.2)
    },
    pendingCommands: Object.keys(pendingCommands).reduce((acc, key) => {
      acc[key] = pendingCommands[key].filter(cmd => cmd.status === COMMAND_STATUS.PENDING);
      return acc;
    }, {}),
    timestamp: new Date().toISOString()
  };
  
  socket.emit('initData', initData);
  console.log(`[${socket.id}] Sent initial data`);

  // Handle ESP32 device connections
  socket.on('deviceConnect', (deviceId) => {
    if (devicePlantMap[deviceId]) {
      socket.join(`device_${deviceId}`);
      deviceStates[deviceId].connectionStatus = 'connected';
      deviceStates[deviceId].lastSeen = new Date().toISOString();
      console.log(`Device ${deviceId} connected and joined room device_${deviceId}`);
      
      // Notify all clients about device connection
      io.emit('deviceStatusUpdate', {
        deviceId,
        status: 'connected',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle requests for initial data
  socket.on('requestInitialData', (data) => {
    try {
      const { plantType, deviceId, deviceIds } = data;
      
      console.log(`[${socket.id}] Requested initial data for:`, { plantType, deviceId, deviceIds });
      
      // Send data for specific device or all devices
      const targetDevices = deviceIds || (deviceId ? [deviceId] : Object.keys(sensorData));
      
      const responseData = {
        sensorData: {},
        reservoirLevels: {
          water: sensorData['esp32_1']?.waterLevel || 75,
          waterCm: Math.round((sensorData['esp32_1']?.waterLevel || 75) * 0.2),
          fertilizer: sensorData['esp32_2']?.fertilizerLevel || 60,
          fertilizerCm: Math.round((sensorData['esp32_2']?.fertilizerLevel || 60) * 0.2)
        },
        wateringActive: deviceStates['esp32_1']?.waterPump || false,
        lightActive: deviceStates[deviceId || 'esp32_1']?.light || false,
        timestamp: new Date().toISOString()
      };
      
      // Add sensor data for requested devices
      targetDevices.forEach(devId => {
        if (sensorData[devId]) {
          responseData.sensorData[devId] = sensorData[devId];
        }
      });
      
      socket.emit('initData', responseData);
      
    } catch (error) {
      console.error(`[${socket.id}] Error in requestInitialData:`, error);
      socket.emit('error', {
        message: 'Failed to get initial data',
        error: error.message
      });
    }
  });

  // Handle control commands from frontend
  socket.on('control', (data) => {
    try {
      const { deviceId, command, value, plantType } = data;
      
      console.log(`[${socket.id}] Control command received:`, { deviceId, command, value, plantType });
      
      if (!deviceId || !command) {
        return socket.emit('controlResponse', { 
          success: false,
          error: 'Missing deviceId or command',
          received: data
        });
      }

      // Map frontend commands
      const commandMapping = {
        'water_pump': 'water',
        'grow_light': 'light',
        'nutrient_pump': 'nutrients'
      };
      
      const frontendAction = commandMapping[command] || command;

      // Update device state
      if (command === 'grow_light') {
        deviceStates[deviceId].light = !deviceStates[deviceId].light;
      } else if (command === 'water_pump') {
        deviceStates[deviceId].waterPump = !deviceStates[deviceId].waterPump;
        if (deviceStates[deviceId].waterPump) {
          deviceStates[deviceId].lastWatered = new Date().toISOString();
        }
      } else if (command === 'nutrient_pump') {
        deviceStates[deviceId].lastNutrients = new Date().toISOString();
      }

      // Send response
      const response = {
        action: frontendAction,
        deviceId,
        plantType,
        success: true,
        active: command === 'grow_light' ? deviceStates[deviceId].light : 
                command === 'water_pump' ? deviceStates[deviceId].waterPump : false,
        message: `${frontendAction} command executed successfully`,
        timestamp: new Date().toISOString()
      };
      
      // Broadcast to all clients
      io.emit('controlResponse', response);
      
    } catch (error) {
      console.error(`[${socket.id}] Error in control:`, error);
      socket.emit('controlResponse', {
        success: false,
        message: 'Failed to process control command',
        error: error.message
      });
    }
  });

  // Handle plant type changes
  socket.on('setPlantType', (data) => {
    try {
      const { plantType, deviceId } = data;
      console.log(`[${socket.id}] Plant type changed to:`, { plantType, deviceId });
      
      // Send current data for the new plant type
      if (sensorData[deviceId]) {
        socket.emit('dataUpdate', {
          deviceId,
          plantType,
          data: sensorData[deviceId],
          state: deviceStates[deviceId]
        });
      }
      
    } catch (error) {
      console.error(`[${socket.id}] Error in setPlantType:`, error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected [${socket.id}]: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error(`[${socket.id}] Socket error:`, error);
  });
});

// Simulate sensor data updates for testing
setInterval(() => {
  Object.keys(sensorData).forEach(deviceId => {
    if (sensorData[deviceId]) {
      // Add small random variations to simulate real sensor readings
      const data = sensorData[deviceId];
      
      sensorData[deviceId] = {
        ...data,
        temperature: Math.max(15, Math.min(30, data.temperature + (Math.random() - 0.5) * 2)),
        humidity: Math.max(30, Math.min(90, data.humidity + (Math.random() - 0.5) * 5)),
        moisture: Math.max(0, Math.min(100, data.moisture + (Math.random() - 0.5) * 3)),
        sunlight: Math.max(0, Math.min(4095, data.sunlight + (Math.random() - 0.5) * 200)),
        nitrogen: Math.max(0, Math.min(100, data.nitrogen + (Math.random() - 0.5) * 2)),
        phosphorus: Math.max(0, Math.min(100, data.phosphorus + (Math.random() - 0.5) * 2)),
        potassium: Math.max(0, Math.min(100, data.potassium + (Math.random() - 0.5) * 2)),
        timestamp: new Date().toISOString()
      };
      
      // Emit updated data
      const plantType = devicePlantMap[deviceId];
      io.emit('dataUpdate', {
        deviceId,
        plantType,
        data: sensorData[deviceId],
        state: deviceStates[deviceId]
      });
    }
  });
  
  // Update reservoir levels
  const reservoirLevels = {
    water: sensorData['esp32_1']?.waterLevel || 75,
    waterCm: Math.round((sensorData['esp32_1']?.waterLevel || 75) * 0.2),
    fertilizer: sensorData['esp32_2']?.fertilizerLevel || 60,
    fertilizerCm: Math.round((sensorData['esp32_2']?.fertilizerLevel || 60) * 0.2)
  };
  
  io.emit('reservoirUpdate', reservoirLevels);
  
}, 30000); // Update every 30 seconds

// Cleanup old data periodically
setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  // Cleanup pending commands
  Object.keys(pendingCommands).forEach(deviceId => {
    pendingCommands[deviceId] = pendingCommands[deviceId].filter(command => {
      const commandTime = new Date(command.timestamp);
      const shouldKeep = commandTime > oneHourAgo || command.status === COMMAND_STATUS.PENDING;
      
      // Clear timeout if command is being removed
      if (!shouldKeep && global.commandTimeouts && global.commandTimeouts.has(command.id)) {
        clearTimeout(global.commandTimeouts.get(command.id));
        global.commandTimeouts.delete(command.id);
      }
      
      return shouldKeep;
    });
  });
  
  // Update device connection status
  Object.keys(deviceStates).forEach(deviceId => {
    if (deviceStates[deviceId].lastSeen) {
      const lastSeen = new Date(deviceStates[deviceId].lastSeen);
      if (lastSeen < oneHourAgo) {
        deviceStates[deviceId].connectionStatus = 'disconnected';
      }
    }
  });
  
  console.log('Performed periodic cleanup');
}, 30 * 60 * 1000); // Run every 30 minutes

// Enhanced server startup
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 HTTP endpoints:`);
  console.log(`- http://localhost:${PORT}/`);
  console.log(`- http://localhost:${PORT}/health`);
  console.log(`- http://localhost:${PORT}/update`);
  console.log(`- http://localhost:${PORT}/send-command`);
  console.log(`- http://localhost:${PORT}/sensor-data/:plantType`);
  console.log(`- http://localhost:${PORT}/test-emit`);
  console.log(`⚡ WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`📱 Devices: ${Object.keys(devicePlantMap).join(', ')}`);
  console.log(`🌱 Plant types: ${Object.values(devicePlantMap).join(', ')}`);
});

// Handle process events
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});